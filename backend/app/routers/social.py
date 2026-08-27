"""Fan-to-fan social surfaces: follows, public collections, and card trades."""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Query, status
from sqlalchemy import delete, func, or_, select
from sqlalchemy.exc import IntegrityError

from app.dependencies import DbSession, FanUser, OptionalCurrentUser
from app.errors import AppError
from app.models import (
    Artist,
    Card,
    CardCombinationMaterial,
    CardOwnershipLedger,
    CardPack,
    CardPackCard,
    CardVisibility,
    FanWishlistItem,
    Follow,
    Member,
    Role,
    TradeHold,
    TradeItem,
    TradeLock,
    TradeProposal,
    User,
    UserBlock,
    UserCard,
)
from app.schemas import CollectionVisibilityUpdate, TradeProposalCreate
from app.services import (
    notify_followers_of_card,
    notify_user_once,
    record_audit,
    record_engagement_event,
)
from app.tasks import enqueue_engagement_event

router = APIRouter(prefix="/api", tags=["social"])


def _card_image_url(card: Card) -> str:
    if card.image_asset_id:
        return f"/api/cards/{card.id}/image?client=fan"
    return card.image_url


def _collection_card(
    user_card: UserCard, card: Card, artist: Artist | None, member: Member | None
) -> dict:
    return {
        "userCardId": user_card.id,
        "cardId": card.id,
        "name": card.name,
        "imageUrl": _card_image_url(card),
        "isOfficial": card.is_official,
        "artistId": artist.id if artist else card.artist_id,
        "artistName": artist.name if artist else None,
        "memberId": member.id if member else card.member_id,
        "memberName": member.name if member else None,
        "rarity": card.rarity,
        "seasonName": card.season_name,
        "cardType": getattr(card, "card_type", None),
        "signatureText": card.signature_text,
        "issueLimit": card.issue_limit,
        "acquisitionSource": user_card.acquisition_source,
        "serialNumber": user_card.serial_number,
        "acquiredAt": user_card.acquired_at.isoformat(),
        "expiresAt": user_card.expires_at.isoformat() if user_card.expires_at else None,
        "tradable": bool(card.tradable)
        and user_card.expires_at is None
        and user_card.trade_locked_at is None
        and user_card.acquisition_source != "combination",
    }


def _wanted_card(card: Card, artist: Artist | None, member: Member | None) -> dict:
    return {
        "cardId": card.id,
        "name": card.name,
        "imageUrl": _card_image_url(card),
        "isOfficial": card.is_official,
        "artistId": artist.id if artist else card.artist_id,
        "artistName": artist.name if artist else None,
        "memberId": member.id if member else card.member_id,
        "memberName": member.name if member else None,
        "rarity": card.rarity,
        "seasonName": card.season_name,
        "cardType": getattr(card, "card_type", None),
        "signatureText": card.signature_text,
        "issueLimit": card.issue_limit,
    }


async def _is_blocked(session: DbSession, first_id: str, second_id: str) -> bool:
    return bool(
        await session.scalar(
            select(UserBlock.id).where(
                or_(
                    (UserBlock.blocker_id == first_id) & (UserBlock.blocked_id == second_id),
                    (UserBlock.blocker_id == second_id) & (UserBlock.blocked_id == first_id),
                )
            )
        )
    )


def _trade_error(code: str, message: str = "거래할 수 없는 카드입니다.") -> AppError:
    return AppError(422, code, message)


def _as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


async def _load_trade_cards(
    session: DbSession,
    user_id: str,
    user_card_ids: list[str],
) -> list[tuple[UserCard, Card]]:
    if len(user_card_ids) != len(set(user_card_ids)):
        raise _trade_error("DUPLICATE_TRADE_CARD", "같은 카드는 한 번만 선택할 수 있습니다.")
    if not user_card_ids:
        return []
    rows = list(
        (
            await session.execute(
                select(UserCard, Card)
                .join(Card, UserCard.card_id == Card.id)
                .where(UserCard.user_id == user_id, UserCard.id.in_(user_card_ids))
                .with_for_update()
            )
        ).all()
    )
    by_id = {user_card.id: (user_card, card) for user_card, card in rows}
    missing = [card_id for card_id in user_card_ids if card_id not in by_id]
    if missing:
        raise AppError(404, "USER_CARD_NOT_FOUND", "보유한 카드만 거래할 수 있습니다.")
    return [by_id[card_id] for card_id in user_card_ids]


async def _validate_trade_cards(
    session: DbSession,
    cards: list[tuple[UserCard, Card]],
) -> None:
    if not cards:
        raise _trade_error("TRADE_CARDS_REQUIRED", "거래할 카드를 한 장 이상 선택해 주세요.")
    for user_card, card in cards:
        if not card.tradable:
            raise _trade_error("CARD_NOT_TRADABLE")
        if user_card.expires_at is not None:
            raise _trade_error("CARD_NOT_TRADABLE", "기간제 카드는 거래할 수 없습니다.")
        if user_card.trade_locked_at is not None:
            raise _trade_error("CARD_NOT_TRADABLE", "잠긴 카드는 거래할 수 없습니다.")
        if user_card.acquisition_source == "combination":
            raise _trade_error("CARD_NOT_TRADABLE", "조합으로 얻은 카드는 거래할 수 없습니다.")
        if await session.scalar(
            select(CardCombinationMaterial.id).where(
                CardCombinationMaterial.user_card_id == user_card.id
            )
        ):
            raise _trade_error("CARD_NOT_TRADABLE", "조합에 사용한 카드는 거래할 수 없습니다.")
        if await session.scalar(select(TradeLock.id).where(TradeLock.user_card_id == user_card.id)):
            raise _trade_error("CARD_ALREADY_IN_TRADE", "이미 다른 거래에 포함된 카드입니다.")


def _proposal_data(proposal: TradeProposal, items: list[TradeItem]) -> dict:
    return {
        "id": proposal.id,
        "proposerUserId": proposal.proposer_id,
        "recipientUserId": proposal.recipient_id,
        "status": proposal.status,
        "offeredUserCardIds": [item.user_card_id for item in items if item.side == "offered"],
        "requestedUserCardIds": [item.user_card_id for item in items if item.side == "requested"],
        "expiresAt": proposal.expires_at.isoformat(),
        "createdAt": proposal.created_at.isoformat(),
    }


async def _fan_counts(session: DbSession, user_id: str) -> tuple[int, int, int]:
    follower_count = int(
        await session.scalar(
            select(func.count()).select_from(Follow).where(Follow.following_id == user_id)
        )
        or 0
    )
    following_count = int(
        await session.scalar(
            select(func.count()).select_from(Follow).where(Follow.follower_id == user_id)
        )
        or 0
    )
    owned_count = int(
        await session.scalar(
            select(func.count())
            .select_from(UserCard)
            .outerjoin(
                CardCombinationMaterial,
                CardCombinationMaterial.user_card_id == UserCard.id,
            )
            .where(
                UserCard.user_id == user_id,
                CardCombinationMaterial.id.is_(None),
            )
        )
        or 0
    )
    return follower_count, following_count, owned_count


async def _fan_data(session: DbSession, target: User, viewer_id: str | None) -> dict:
    follower_count, following_count, owned_count = await _fan_counts(session, target.id)
    is_following = False
    if viewer_id and viewer_id != target.id:
        is_following = bool(
            await session.scalar(
                select(Follow.id).where(
                    Follow.follower_id == viewer_id,
                    Follow.following_id == target.id,
                )
            )
        )
    favorite_artist_ids = list(target.favorite_artist_ids or [])
    artists_by_id: dict[str, Artist] = {}
    if favorite_artist_ids:
        artists = list(
            await session.scalars(select(Artist).where(Artist.id.in_(favorite_artist_ids)))
        )
        artists_by_id = {artist.id: artist for artist in artists}
    favorite_artists = [
        {
            "id": artist.id,
            "name": artist.name,
            "imageUrl": artist.image_url,
        }
        for artist_id in favorite_artist_ids
        if (artist := artists_by_id.get(artist_id)) is not None
    ]
    shared_artist_ids: set[str] = set()
    viewer_wishlist_card_ids: set[str] = set()
    if viewer_id and viewer_id != target.id:
        viewer = await session.get(User, viewer_id)
        shared_artist_ids = set(viewer.favorite_artist_ids or []) if viewer else set()
        viewer_wishlist_card_ids = set(
            await session.scalars(
                select(FanWishlistItem.card_id).where(FanWishlistItem.user_id == viewer_id)
            )
        )

    visibility = await session.get(CardVisibility, target.id)
    collection_is_public = visibility is None or visibility.public_enabled
    collection_rows: list[tuple[UserCard, Card, Artist | None, Member | None]] = []
    if collection_is_public:
        collection_rows = list(
            (
                await session.execute(
                    select(UserCard, Card, Artist, Member)
                    .select_from(UserCard)
                    .join(Card, UserCard.card_id == Card.id)
                    .outerjoin(Artist, Card.artist_id == Artist.id)
                    .outerjoin(Member, Card.member_id == Member.id)
                    .outerjoin(
                        CardCombinationMaterial,
                        CardCombinationMaterial.user_card_id == UserCard.id,
                    )
                    .where(
                        UserCard.user_id == target.id,
                        CardCombinationMaterial.id.is_(None),
                    )
                    .order_by(UserCard.acquired_at.desc(), UserCard.id)
                )
            ).all()
        )
    collection_cards = [
        _collection_card(user_card, card, artist, member)
        for user_card, card, artist, member in collection_rows
    ]
    matching_wishlist_count = len(
        {card.id for _, card, _, _ in collection_rows} & viewer_wishlist_card_ids
    )
    return {
        "id": target.id,
        "nickname": target.nickname or target.email or target.id,
        "profileImageUrl": target.profile_image_url,
        "isFollowing": is_following,
        "followerCount": follower_count,
        "followingCount": following_count,
        "ownedCount": owned_count,
        "tradableCount": sum(1 for card in collection_cards if card["tradable"]),
        "favoriteArtists": favorite_artists,
        "sharedFavoriteArtists": [
            artist for artist in favorite_artists if artist["id"] in shared_artist_ids
        ],
        "previewCards": collection_cards[:3],
        "matchingWishlistCount": matching_wishlist_count,
        "latestCardAt": collection_cards[0]["acquiredAt"] if collection_cards else None,
    }


async def _trade_card_data(session: DbSession, item: TradeItem) -> dict:
    row = (
        await session.execute(
            select(UserCard, Card, Artist, Member)
            .select_from(UserCard)
            .join(Card, UserCard.card_id == Card.id)
            .outerjoin(Artist, Card.artist_id == Artist.id)
            .outerjoin(Member, Card.member_id == Member.id)
            .where(UserCard.id == item.user_card_id)
        )
    ).one_or_none()
    if row is None:
        return {"userCardId": item.user_card_id, "side": item.side, "unavailable": True}
    user_card, card, artist, member = row
    return {**_collection_card(user_card, card, artist, member), "side": item.side}


def _trade_user_data(user: User) -> dict:
    return {
        "id": user.id,
        "nickname": user.nickname or user.email or user.id,
        "profileImageUrl": user.profile_image_url,
    }


async def _trade_data(session: DbSession, proposal: TradeProposal) -> dict:
    items = list(
        await session.scalars(
            select(TradeItem)
            .where(TradeItem.proposal_id == proposal.id)
            .order_by(TradeItem.side, TradeItem.id)
        )
    )
    cards = [await _trade_card_data(session, item) for item in items]
    proposer = await session.get(User, proposal.proposer_id)
    recipient = await session.get(User, proposal.recipient_id)
    return {
        **_proposal_data(proposal, items),
        "proposer": _trade_user_data(proposer) if proposer else {"id": proposal.proposer_id},
        "recipient": _trade_user_data(recipient) if recipient else {"id": proposal.recipient_id},
        "offeredCards": [card for card in cards if card.get("side") == "offered"],
        "requestedCards": [card for card in cards if card.get("side") == "requested"],
    }


async def _expire_trade_proposal(session: DbSession, proposal: TradeProposal) -> bool:
    if proposal.status != "pending" or _as_utc(proposal.expires_at) > datetime.now(UTC):
        return False
    proposal.status = "expired"
    proposal.responded_at = datetime.now(UTC)
    await session.execute(delete(TradeLock).where(TradeLock.proposal_id == proposal.id))
    for user_id in (proposal.proposer_id, proposal.recipient_id):
        await notify_user_once(
            session,
            user_id=user_id,
            kind="trade_expired",
            title="카드 거래 제안이 만료됐어요",
            body="기한 안에 처리되지 않은 카드 거래 제안이 종료됐습니다.",
            entity_type="trade",
            entity_id=proposal.id,
            event_key=f"trade:{proposal.id}:expired:{user_id}",
        )
    return True


@router.put("/me/collection-visibility")
async def update_collection_visibility(
    payload: CollectionVisibilityUpdate,
    user: FanUser,
    session: DbSession,
) -> dict:
    visibility = await session.get(CardVisibility, user.id)
    if visibility is None:
        visibility = CardVisibility(user_id=user.id, public_enabled=payload.public)
        session.add(visibility)
    else:
        visibility.public_enabled = payload.public
        visibility.updated_at = datetime.now(UTC)
    await session.commit()
    return {"ok": True, "data": {"public": visibility.public_enabled}}


@router.post("/me/blocks/{user_id}", status_code=status.HTTP_201_CREATED)
async def block_fan(user_id: str, user: FanUser, session: DbSession) -> dict:
    if user_id == user.id:
        raise AppError(422, "SELF_BLOCK_NOT_ALLOWED", "자기 자신은 차단할 수 없습니다.")
    target = await session.get(User, user_id)
    if not target or target.role != Role.FAN:
        raise AppError(404, "FAN_NOT_FOUND", "차단할 팬을 찾을 수 없습니다.")
    existing = await session.scalar(
        select(UserBlock).where(UserBlock.blocker_id == user.id, UserBlock.blocked_id == user_id)
    )
    if existing:
        return {"ok": True, "data": {"blockedUserId": user_id, "blocked": True}}
    session.add(UserBlock(id=str(uuid4()), blocker_id=user.id, blocked_id=user_id))
    await session.execute(
        delete(Follow).where(
            or_(
                (Follow.follower_id == user.id) & (Follow.following_id == user_id),
                (Follow.follower_id == user_id) & (Follow.following_id == user.id),
            )
        )
    )
    await session.commit()
    return {"ok": True, "data": {"blockedUserId": user_id, "blocked": True}}


@router.delete("/me/blocks/{user_id}")
async def unblock_fan(user_id: str, user: FanUser, session: DbSession) -> dict:
    await session.execute(
        delete(UserBlock).where(UserBlock.blocker_id == user.id, UserBlock.blocked_id == user_id)
    )
    await session.commit()
    return {"ok": True, "data": {"blockedUserId": user_id, "blocked": False}}


@router.post("/me/follows/{user_id}", status_code=status.HTTP_201_CREATED)
async def follow_fan(
    user_id: str,
    user: FanUser,
    session: DbSession,
    background_tasks: BackgroundTasks,
) -> dict:
    if user_id == user.id:
        raise AppError(422, "SELF_FOLLOW_NOT_ALLOWED", "자기 자신은 팔로우할 수 없습니다.")
    target = await session.get(User, user_id)
    if not target or target.role != Role.FAN or await _is_blocked(session, user.id, user_id):
        raise AppError(404, "FAN_NOT_FOUND", "팔로우할 팬을 찾을 수 없습니다.")
    existing = await session.scalar(
        select(Follow).where(Follow.follower_id == user.id, Follow.following_id == user_id)
    )
    if existing:
        return {"ok": True, "data": {"followingUserId": user_id, "following": True}}
    follow = Follow(id=str(uuid4()), follower_id=user.id, following_id=user_id)
    session.add(follow)
    engagement_event = await record_engagement_event(
        session,
        user_id=user.id,
        kind="fan_followed",
        source_type="follow",
        source_id=follow.id,
        payload={"followingUserId": user_id},
    )
    await session.commit()
    enqueue_engagement_event(engagement_event.id, background_tasks)
    return {"ok": True, "data": {"followingUserId": user_id, "following": True}}


@router.delete("/me/follows/{user_id}")
async def unfollow_fan(user_id: str, user: FanUser, session: DbSession) -> dict:
    await session.execute(
        delete(Follow).where(Follow.follower_id == user.id, Follow.following_id == user_id)
    )
    await session.commit()
    return {"ok": True, "data": {"followingUserId": user_id, "following": False}}


@router.get("/fans")
async def search_fans(
    user: FanUser,
    session: DbSession,
    query: str = Query(default="", max_length=100),
) -> dict:
    statement = select(User).where(User.role == Role.FAN, User.id != user.id)
    normalized_query = query.strip()
    if normalized_query:
        pattern = f"%{normalized_query}%"
        matching_card_owners = (
            select(UserCard.user_id)
            .join(Card, UserCard.card_id == Card.id)
            .outerjoin(Artist, Card.artist_id == Artist.id)
            .outerjoin(Member, Card.member_id == Member.id)
            .outerjoin(CardVisibility, CardVisibility.user_id == UserCard.user_id)
            .outerjoin(
                CardCombinationMaterial,
                CardCombinationMaterial.user_card_id == UserCard.id,
            )
            .where(
                CardCombinationMaterial.id.is_(None),
                or_(
                    CardVisibility.user_id.is_(None),
                    CardVisibility.public_enabled.is_(True),
                ),
                or_(
                    Card.name.ilike(pattern),
                    Card.season_name.ilike(pattern),
                    Artist.name.ilike(pattern),
                    Member.name.ilike(pattern),
                ),
            )
            .distinct()
        )
        statement = statement.where(
            or_(
                User.id.ilike(pattern),
                User.email.ilike(pattern),
                User.nickname.ilike(pattern),
                User.id.in_(matching_card_owners),
            )
        )
    targets = list(await session.scalars(statement.order_by(User.nickname, User.email, User.id)))
    visible_targets = [
        target for target in targets if not await _is_blocked(session, user.id, target.id)
    ]
    return {
        "ok": True,
        "data": {
            "items": [await _fan_data(session, target, user.id) for target in visible_targets]
        },
    }


@router.get("/me/follows")
async def fan_connections(
    user: FanUser,
    session: DbSession,
    kind: str = Query(default="following", pattern="^(following|followers)$"),
) -> dict:
    if kind == "followers":
        statement = (
            select(User)
            .join(Follow, Follow.follower_id == User.id)
            .where(Follow.following_id == user.id)
        )
    else:
        statement = (
            select(User)
            .join(Follow, Follow.following_id == User.id)
            .where(Follow.follower_id == user.id)
        )
    targets = list(await session.scalars(statement.order_by(User.nickname, User.email, User.id)))
    return {
        "ok": True,
        "data": {
            "kind": kind,
            "items": [await _fan_data(session, target, user.id) for target in targets],
        },
    }


@router.get("/fans/{user_id}/collection")
async def public_collection(
    user_id: str,
    session: DbSession,
    viewer: OptionalCurrentUser,
) -> dict:
    target = await session.get(User, user_id)
    if not target or target.role != Role.FAN:
        raise AppError(404, "COLLECTION_NOT_FOUND", "컬렉션을 찾을 수 없습니다.")
    if viewer is None or viewer.id != user_id:
        if viewer and await _is_blocked(session, viewer.id, user_id):
            raise AppError(404, "COLLECTION_NOT_FOUND", "컬렉션을 찾을 수 없습니다.")
        visibility = await session.get(CardVisibility, user_id)
        if visibility and not visibility.public_enabled:
            raise AppError(404, "COLLECTION_NOT_FOUND", "비공개 컬렉션입니다.")
    rows = list(
        (
            await session.execute(
                select(UserCard, Card, Artist, Member)
                .select_from(UserCard)
                .join(Card, UserCard.card_id == Card.id)
                .outerjoin(Artist, Card.artist_id == Artist.id)
                .outerjoin(Member, Card.member_id == Member.id)
                .outerjoin(
                    CardCombinationMaterial,
                    CardCombinationMaterial.user_card_id == UserCard.id,
                )
                .where(
                    UserCard.user_id == user_id,
                    CardCombinationMaterial.id.is_(None),
                )
                .order_by(UserCard.acquired_at.desc(), UserCard.id)
            )
        ).all()
    )
    cards = [
        _collection_card(user_card, card, artist, member)
        for user_card, card, artist, member in rows
    ]
    wanted_rows = list(
        (
            await session.execute(
                select(Card, Artist, Member)
                .select_from(FanWishlistItem)
                .join(Card, FanWishlistItem.card_id == Card.id)
                .outerjoin(Artist, Card.artist_id == Artist.id)
                .outerjoin(Member, Card.member_id == Member.id)
                .where(FanWishlistItem.user_id == user_id)
                .order_by(FanWishlistItem.created_at.desc(), FanWishlistItem.id.desc())
            )
        ).all()
    )
    wanted_cards = [_wanted_card(card, artist, member) for card, artist, member in wanted_rows]
    card_ids = [card.id for _, card, _, _ in rows]
    featured_pack_id = None
    if card_ids:
        featured_pack_id = await session.scalar(
            select(CardPack.id)
            .join(CardPackCard, CardPackCard.pack_id == CardPack.id)
            .where(
                CardPack.status == "published",
                CardPackCard.enabled.is_(True),
                CardPackCard.card_id.in_(card_ids),
            )
            .order_by(CardPack.published_at.desc(), CardPack.id)
            .limit(1)
        )
    follower_count, following_count, _ = await _fan_counts(session, user_id)
    is_following = bool(
        viewer
        and viewer.id != user_id
        and await session.scalar(
            select(Follow.id).where(
                Follow.follower_id == viewer.id,
                Follow.following_id == user_id,
            )
        )
    )
    favorite_artist_rows = list(
        await session.scalars(select(Artist).where(Artist.id.in_(target.favorite_artist_ids or [])))
    )
    favorite_artists_by_id = {artist.id: artist for artist in favorite_artist_rows}
    favorite_artists = [
        {
            "id": artist_id,
            "name": favorite_artists_by_id[artist_id].name,
            "imageUrl": favorite_artists_by_id[artist_id].image_url,
        }
        for artist_id in target.favorite_artist_ids or []
        if artist_id in favorite_artists_by_id
    ]
    return {
        "ok": True,
        "data": {
            "userId": user_id,
            "nickname": target.nickname,
            "profileImageUrl": target.profile_image_url,
            "featuredPackId": featured_pack_id,
            "visibility": "public",
            "isFollowing": is_following,
            "summary": {
                "ownedCount": len(cards),
                "followerCount": follower_count,
                "followingCount": following_count,
            },
            "favoriteArtists": favorite_artists,
            "cards": cards,
            "wantedCards": wanted_cards,
        },
    }


@router.get("/me/trades")
async def trade_inbox(
    user: FanUser,
    session: DbSession,
    box: str = Query(default="all", pattern="^(all|sent|received)$"),
    trade_status: str | None = Query(default=None, alias="status"),
) -> dict:
    statement = select(TradeProposal)
    if box == "sent":
        statement = statement.where(TradeProposal.proposer_id == user.id)
    elif box == "received":
        statement = statement.where(TradeProposal.recipient_id == user.id)
    else:
        statement = statement.where(
            or_(TradeProposal.proposer_id == user.id, TradeProposal.recipient_id == user.id)
        )
    proposals = list(
        await session.scalars(
            statement.order_by(TradeProposal.created_at.desc(), TradeProposal.id.desc())
        )
    )
    expired_any = False
    for proposal in proposals:
        expired_any = await _expire_trade_proposal(session, proposal) or expired_any
    if expired_any:
        await session.commit()
    if trade_status:
        proposals = [proposal for proposal in proposals if proposal.status == trade_status]
    return {
        "ok": True,
        "data": {
            "box": box,
            "items": [await _trade_data(session, proposal) for proposal in proposals],
        },
    }


@router.get("/me/trades/{proposal_id}")
async def trade_detail(proposal_id: str, user: FanUser, session: DbSession) -> dict:
    proposal = await session.get(TradeProposal, proposal_id)
    if not proposal:
        raise AppError(404, "TRADE_NOT_FOUND", "거래 제안을 찾을 수 없습니다.")
    if user.id not in {proposal.proposer_id, proposal.recipient_id}:
        raise AppError(403, "TRADE_NOT_ALLOWED", "이 거래를 확인할 권한이 없습니다.")
    if await _expire_trade_proposal(session, proposal):
        await session.commit()
    return {"ok": True, "data": await _trade_data(session, proposal)}


@router.post("/me/trades", status_code=status.HTTP_201_CREATED)
async def create_trade(
    payload: TradeProposalCreate,
    user: FanUser,
    session: DbSession,
) -> dict:
    if payload.recipient_user_id == user.id:
        raise AppError(422, "TRADE_SELF_NOT_ALLOWED", "자기 자신에게 거래를 제안할 수 없습니다.")
    recipient = await session.get(User, payload.recipient_user_id)
    if (
        not recipient
        or recipient.role != Role.FAN
        or await _is_blocked(session, user.id, recipient.id)
    ):
        raise AppError(404, "TRADE_USER_UNAVAILABLE", "거래 상대를 찾을 수 없습니다.")
    offered_ids = list(payload.offered_user_card_ids)
    requested_ids = list(payload.requested_user_card_ids)
    if set(offered_ids) & set(requested_ids):
        raise _trade_error("DUPLICATE_TRADE_CARD", "같은 카드는 양쪽에 동시에 넣을 수 없습니다.")
    offered = await _load_trade_cards(session, user.id, offered_ids)
    requested = await _load_trade_cards(session, recipient.id, requested_ids)
    await _validate_trade_cards(session, offered)
    if requested:
        await _validate_trade_cards(session, requested)
    now = datetime.now(UTC)
    proposal = TradeProposal(
        id=str(uuid4()),
        proposer_id=user.id,
        recipient_id=recipient.id,
        status="pending",
        expires_at=now + timedelta(days=7),
    )
    items = [
        TradeItem(
            id=str(uuid4()), proposal_id=proposal.id, user_card_id=user_card.id, side="offered"
        )
        for user_card, _ in offered
    ] + [
        TradeItem(
            id=str(uuid4()), proposal_id=proposal.id, user_card_id=user_card.id, side="requested"
        )
        for user_card, _ in requested
    ]
    locks = [
        TradeLock(id=str(uuid4()), proposal_id=proposal.id, user_card_id=item.user_card_id)
        for item in items
    ]
    session.add_all([proposal, *items, *locks])
    await record_audit(
        session,
        actor_user_id=user.id,
        action="trade.created",
        entity_type="trade",
        entity_id=proposal.id,
        details={"offeredUserCardIds": offered_ids, "requestedUserCardIds": requested_ids},
    )
    await notify_user_once(
        session,
        user_id=recipient.id,
        kind="trade_received",
        title="새 카드 거래 제안이 도착했어요",
        body="받은 거래함에서 제안 카드를 확인해 보세요.",
        entity_type="trade",
        entity_id=proposal.id,
        event_key=f"trade:{proposal.id}:received",
    )
    try:
        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        raise AppError(
            409, "CARD_ALREADY_IN_TRADE", "이미 다른 거래에 포함된 카드입니다."
        ) from error
    return {"ok": True, "data": _proposal_data(proposal, items)}


async def _load_pending_proposal(
    proposal_id: str, user: User, session: DbSession, role: str
) -> TradeProposal:
    proposal = await session.scalar(
        select(TradeProposal).where(TradeProposal.id == proposal_id).with_for_update()
    )
    if not proposal:
        raise AppError(404, "TRADE_NOT_FOUND", "거래 제안을 찾을 수 없습니다.")
    expected_user_id = proposal.recipient_id if role == "recipient" else proposal.proposer_id
    if expected_user_id != user.id:
        raise AppError(403, "TRADE_NOT_ALLOWED", "이 거래를 처리할 권한이 없습니다.")
    if proposal.status != "pending":
        raise AppError(409, "TRADE_NOT_PENDING", "대기 중인 거래만 처리할 수 있습니다.")
    held = await session.scalar(
        select(TradeHold).where(
            TradeHold.proposal_id == proposal.id, TradeHold.released_at.is_(None)
        )
    )
    if held is not None:
        raise AppError(409, "TRADE_ON_HOLD", "운영 검토 중인 거래는 처리할 수 없습니다.")
    if _as_utc(proposal.expires_at) <= datetime.now(UTC):
        await _expire_trade_proposal(session, proposal)
        await session.commit()
        raise AppError(409, "TRADE_EXPIRED", "거래 제안이 만료되었습니다.")
    return proposal


async def _accept_trade_once(
    proposal_id: str,
    user: FanUser,
    session: DbSession,
    background_tasks: BackgroundTasks,
) -> dict:
    proposal = await _load_pending_proposal(proposal_id, user, session, "recipient")
    items = list(
        await session.scalars(select(TradeItem).where(TradeItem.proposal_id == proposal.id))
    )
    card_ids = [item.user_card_id for item in items]
    user_cards = {
        card.id: card
        for card in await session.scalars(
            select(UserCard).where(UserCard.id.in_(card_ids)).with_for_update()
        )
    }
    for item in items:
        expected_owner = proposal.proposer_id if item.side == "offered" else proposal.recipient_id
        if user_cards[item.user_card_id].user_id != expected_owner:
            raise AppError(409, "TRADE_STATE_CONFLICT", "거래 카드의 소유자가 변경되었습니다.")
    now = datetime.now(UTC)
    for item in items:
        card = user_cards[item.user_card_id]
        old_owner = card.user_id
        card.user_id = proposal.recipient_id if item.side == "offered" else proposal.proposer_id
        session.add(
            CardOwnershipLedger(
                id=str(uuid4()),
                user_card_id=card.id,
                user_id=card.user_id,
                card_id=card.card_id,
                action="transfer",
                source_type="trade",
                source_id=f"{proposal.id}:{card.id}",
                from_user_id=old_owner,
                to_user_id=card.user_id,
                metadata_json={"proposalId": proposal.id},
                created_at=now,
            )
        )
        await notify_followers_of_card(session, user_card=card)
    proposal.status = "accepted"
    proposal.responded_at = now
    await session.execute(delete(TradeLock).where(TradeLock.proposal_id == proposal.id))
    await record_audit(
        session,
        actor_user_id=user.id,
        action="trade.completed",
        entity_type="trade",
        entity_id=proposal.id,
        details={"proposerId": proposal.proposer_id, "recipientId": proposal.recipient_id},
    )
    await notify_user_once(
        session,
        user_id=proposal.proposer_id,
        kind="trade_accepted",
        title="카드 거래가 성사됐어요",
        body="상대방이 카드 거래를 수락했습니다.",
        entity_type="trade",
        entity_id=proposal.id,
        event_key=f"trade:{proposal.id}:proposer",
    )
    await notify_user_once(
        session,
        user_id=proposal.recipient_id,
        kind="trade_accepted",
        title="카드 거래가 성사됐어요",
        body="카드 거래가 완료되어 컬렉션이 업데이트됐습니다.",
        entity_type="trade",
        entity_id=proposal.id,
        event_key=f"trade:{proposal.id}:recipient",
    )
    trade_events = []
    for participant_id in {proposal.proposer_id, proposal.recipient_id}:
        trade_events.append(
            await record_engagement_event(
                session,
                user_id=participant_id,
                kind="trade_completed",
                source_type="trade",
                source_id=proposal.id,
                payload={
                    "tradeId": proposal.id,
                    "participantRole": (
                        "proposer" if participant_id == proposal.proposer_id else "recipient"
                    ),
                },
            )
        )
    await session.commit()
    for engagement_event in trade_events:
        enqueue_engagement_event(engagement_event.id, background_tasks)
    return {"ok": True, "data": {"id": proposal.id, "status": proposal.status}}


@router.post("/me/trades/{proposal_id}/accept")
async def accept_trade(
    proposal_id: str,
    user: FanUser,
    session: DbSession,
    background_tasks: BackgroundTasks,
) -> dict:
    try:
        return await _accept_trade_once(proposal_id, user, session, background_tasks)
    except IntegrityError as error:
        await session.rollback()
        raise AppError(
            409,
            "TRADE_STATE_CONFLICT",
            "거래가 이미 처리되었거나 카드 소유자가 변경되었습니다.",
        ) from error


async def _reject_or_cancel(
    proposal_id: str, user: FanUser, session: DbSession, role: str, status_value: str
) -> dict:
    proposal = await _load_pending_proposal(proposal_id, user, session, role)
    proposal.status = status_value
    proposal.responded_at = datetime.now(UTC)
    await session.execute(delete(TradeLock).where(TradeLock.proposal_id == proposal.id))
    await record_audit(
        session,
        actor_user_id=user.id,
        action=f"trade.{status_value}",
        entity_type="trade",
        entity_id=proposal.id,
        details={"proposerId": proposal.proposer_id, "recipientId": proposal.recipient_id},
    )
    notified_user_id = proposal.proposer_id if status_value == "rejected" else proposal.recipient_id
    kind = "trade_rejected" if status_value == "rejected" else "trade_cancelled"
    await notify_user_once(
        session,
        user_id=notified_user_id,
        kind=kind,
        title="카드 거래 제안이 종료됐어요",
        body=(
            "상대방이 카드 거래 제안을 거절했습니다."
            if status_value == "rejected"
            else "상대방이 카드 거래 제안을 취소했습니다."
        ),
        entity_type="trade",
        entity_id=proposal.id,
        event_key=f"trade:{proposal.id}:{status_value}",
    )
    await session.commit()
    return {"ok": True, "data": {"id": proposal.id, "status": proposal.status}}


@router.post("/me/trades/{proposal_id}/reject")
async def reject_trade(proposal_id: str, user: FanUser, session: DbSession) -> dict:
    return await _reject_or_cancel(proposal_id, user, session, "recipient", "rejected")


@router.post("/me/trades/{proposal_id}/cancel")
async def cancel_trade(proposal_id: str, user: FanUser, session: DbSession) -> dict:
    return await _reject_or_cancel(proposal_id, user, session, "proposer", "cancelled")
