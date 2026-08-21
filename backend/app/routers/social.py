"""Fan-to-fan social surfaces: follows, public collections, and card trades."""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

from fastapi import APIRouter, status
from sqlalchemy import delete, or_, select
from sqlalchemy.exc import IntegrityError

from app.dependencies import DbSession, FanUser, OptionalCurrentUser
from app.errors import AppError
from app.models import (
    Artist,
    Card,
    CardOwnershipLedger,
    CardVisibility,
    Follow,
    Member,
    Role,
    TradeItem,
    TradeLock,
    TradeProposal,
    User,
    UserBlock,
    UserCard,
)
from app.schemas import CollectionVisibilityUpdate, TradeProposalCreate

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
        "tradable": bool(card.tradable) and not bool(user_card.expires_at),
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


@router.post("/me/follows/{user_id}", status_code=status.HTTP_201_CREATED)
async def follow_fan(user_id: str, user: FanUser, session: DbSession) -> dict:
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
    session.add(Follow(id=str(uuid4()), follower_id=user.id, following_id=user_id))
    await session.commit()
    return {"ok": True, "data": {"followingUserId": user_id, "following": True}}


@router.delete("/me/follows/{user_id}")
async def unfollow_fan(user_id: str, user: FanUser, session: DbSession) -> dict:
    await session.execute(
        delete(Follow).where(Follow.follower_id == user.id, Follow.following_id == user_id)
    )
    await session.commit()
    return {"ok": True, "data": {"followingUserId": user_id, "following": False}}


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
                .where(UserCard.user_id == user_id)
                .order_by(UserCard.acquired_at.desc(), UserCard.id)
            )
        ).all()
    )
    cards = [
        _collection_card(user_card, card, artist, member)
        for user_card, card, artist, member in rows
    ]
    return {
        "ok": True,
        "data": {
            "userId": user_id,
            "nickname": target.nickname,
            "visibility": "public",
            "summary": {"ownedCount": len(cards)},
            "cards": cards,
        },
    }


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
    if _as_utc(proposal.expires_at) <= datetime.now(UTC):
        proposal.status = "expired"
        proposal.responded_at = datetime.now(UTC)
        await session.execute(delete(TradeLock).where(TradeLock.proposal_id == proposal.id))
        await session.commit()
        raise AppError(409, "TRADE_EXPIRED", "거래 제안이 만료되었습니다.")
    return proposal


@router.post("/me/trades/{proposal_id}/accept")
async def accept_trade(proposal_id: str, user: FanUser, session: DbSession) -> dict:
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
    proposal.status = "accepted"
    proposal.responded_at = now
    await session.execute(delete(TradeLock).where(TradeLock.proposal_id == proposal.id))
    await session.commit()
    return {"ok": True, "data": {"id": proposal.id, "status": proposal.status}}


async def _reject_or_cancel(
    proposal_id: str, user: FanUser, session: DbSession, role: str, status_value: str
) -> dict:
    proposal = await _load_pending_proposal(proposal_id, user, session, role)
    proposal.status = status_value
    proposal.responded_at = datetime.now(UTC)
    await session.execute(delete(TradeLock).where(TradeLock.proposal_id == proposal.id))
    await session.commit()
    return {"ok": True, "data": {"id": proposal.id, "status": proposal.status}}


@router.post("/me/trades/{proposal_id}/reject")
async def reject_trade(proposal_id: str, user: FanUser, session: DbSession) -> dict:
    return await _reject_or_cancel(proposal_id, user, session, "recipient", "rejected")


@router.post("/me/trades/{proposal_id}/cancel")
async def cancel_trade(proposal_id: str, user: FanUser, session: DbSession) -> dict:
    return await _reject_or_cancel(proposal_id, user, session, "proposer", "cancelled")
