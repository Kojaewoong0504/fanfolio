import asyncio
import json
import logging
import secrets
from datetime import UTC, datetime
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Header, Query, Request, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy import and_, case, desc, func, or_, select, update
from sqlalchemy.exc import IntegrityError

from app.dependencies import DbSession, FanUser, OptionalCurrentUser
from app.download_signing import download_url, verify_download_token
from app.errors import AppError
from app.models import (
    Artist,
    Asset,
    Card,
    CardCombinationMaterial,
    CardEffectVersion,
    CardOwnershipLedger,
    CardPack,
    CardPackCard,
    CardPackOpening,
    CollectionBenefitClaim,
    CollectionCampaign,
    CollectionGoal,
    Drop,
    Event,
    EventApplication,
    FanWishlistItem,
    Follow,
    Member,
    Notification,
    RewardCatalog,
    Role,
    User,
    UserCard,
)
from app.rate_limit import enforce_rate_limit
from app.schemas import (
    CollectionGoalCreate,
    NotificationPreferencesUpdate,
    ProfileEquipmentUpdate,
    ProfileUpdate,
    ReadNotification,
    RedemptionRequest,
)
from app.services import (
    claim_pass_tier,
    claim_reward_grant,
    fan_pass_data,
    fan_progression_data,
    grant_user_card,
    notify_user_once,
    reconcile_claimed_global_pass_reward_grants,
    record_audit,
    record_engagement_event,
    redeem,
    update_profile_equipment,
)
from app.storage import configured_asset_storage, storage_response
from app.tasks import enqueue_engagement_event

router = APIRouter(prefix="/api", tags=["fan"])
logger = logging.getLogger(__name__)


def public_card_pack_data(pack: CardPack, items: list[dict]) -> dict:
    return {
        "id": pack.id,
        "artistId": pack.artist_id,
        "name": pack.name,
        "seasonName": pack.season_name,
        "version": pack.version,
        "imageUrl": pack.image_url,
        "description": pack.description,
        "status": pack.status,
        "publishedAt": pack.published_at.isoformat() if pack.published_at else None,
        "cards": items,
    }


def public_pack_card_data(link: CardPackCard, card: Card) -> dict:
    return {
        "cardId": card.id,
        "name": card.name,
        "rarity": card.rarity,
        "imageUrl": card_image_url(card),
        "memberId": card.member_id,
        "probability": link.probability,
        "position": link.position,
    }


def catalog_release_visible() -> object:
    """Keep new studio cards private until their selected drop is live.

    Cards made before the release workflow have no review version/drop link and
    remain visible for backward compatibility. Operational cards without an
    artist-studio owner keep the existing direct-publication behavior.
    """
    return or_(
        Card.owner_artist_id.is_(None),
        and_(Card.review_version == 0, Card.drop_id.is_(None)),
        and_(Card.release_status == "published", Drop.status == "live"),
    )


def pack_card_release_visible() -> object:
    """A published pack is the release authority for cards it contains."""
    return Card.status == "published"


async def card_is_visible_to_fans(card: Card, session: DbSession) -> bool:
    """Apply the catalog visibility rule to direct card asset requests too."""
    if card.owner_artist_id is None:
        return True
    if card.review_version == 0 and card.drop_id is None:
        return True
    if card.release_status != "published" or card.drop_id is None:
        return False
    drop = await session.get(Drop, card.drop_id)
    return bool(drop and drop.status == "live")


LENTICULAR_IMAGE_CONTENT_TYPES = {"image/png", "image/jpeg", "image/webp"}


def card_image_url(card: Card) -> str:
    """Use the protected asset-backed image route for artist-created cards."""
    if card.image_asset_id:
        return f"/api/cards/{card.id}/image?client=fan"
    return card.image_url


def is_lenticular_image_asset(asset: Asset | None) -> bool:
    return bool(
        asset and asset.purpose == "card" and asset.content_type in LENTICULAR_IMAGE_CONTENT_TYPES
    )


def lenticular_storage_path(asset: Asset | None) -> str | None:
    if not asset:
        return None
    return asset.processed_storage_path or asset.storage_path


@router.get("/me")
async def me(user: FanUser, session: DbSession) -> dict:
    # Until social follow and spendable-point ledgers are introduced, only
    # values with a durable source are exposed. Favorites are the current
    # follow relationship; unknown counters stay zero instead of showing
    # design-fixture numbers.
    fan_following_count = int(
        await session.scalar(
            select(func.count()).select_from(Follow).where(Follow.follower_id == user.id)
        )
        or 0
    )
    follower_count = int(
        await session.scalar(
            select(func.count()).select_from(Follow).where(Follow.following_id == user.id)
        )
        or 0
    )
    following_count = (
        len(user.favorite_artist_ids or [])
        + len(user.favorite_member_ids or [])
        + fan_following_count
    )
    return {
        "ok": True,
        "data": {
            "id": user.id,
            "email": user.email,
            "profileImageUrl": user.profile_image_url,
            "role": user.role.value,
            "nickname": user.nickname,
            "favoriteArtistIds": user.favorite_artist_ids,
            "favoriteMemberIds": user.favorite_member_ids,
            "onboardingCompleted": user.onboarding_completed,
            "followingCount": following_count,
            "followerCount": follower_count,
            "points": 0,
            "hasPassword": bool(user.password_hash),
        },
    }


@router.post("/redemptions", status_code=status.HTTP_201_CREATED)
async def create_redemption(
    payload: RedemptionRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    user: FanUser,
    session: DbSession,
) -> dict:
    user_id = user.id
    client_host = request.client.host if request.client else "unknown"
    await enforce_rate_limit(f"redemption:{user_id}:{client_host}", limit=10, window_seconds=60)
    redeemed, engagement_event_id = await redeem(session, user, payload.code, payload.source)
    try:
        enqueue_engagement_event(engagement_event_id, background_tasks)
    except Exception:
        logger.exception(
            "Could not enqueue engagement event after redemption commit",
            extra={
                "engagement_event_id": engagement_event_id,
                "user_card_id": redeemed["userCardId"],
                "user_id": user_id,
            },
        )
    return {"ok": True, "data": redeemed}


@router.get("/me/collection")
async def collection(user: FanUser, session: DbSession) -> dict:
    rows = (
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
                UserCard.user_id == user.id,
                CardCombinationMaterial.id.is_(None),
            )
        )
    ).all()
    cards = [
        {
            "userCardId": uc.id,
            "cardId": card.id,
            "name": card.name,
            "imageUrl": card_image_url(card),
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
            "acquisitionSource": uc.acquisition_source,
            "expiresAt": uc.expires_at.isoformat() if uc.expires_at else None,
            "tradable": bool(card.tradable)
            and uc.expires_at is None
            and uc.trade_locked_at is None
            and uc.acquisition_source != "combination",
            "serialNumber": uc.serial_number,
            "acquiredAt": uc.acquired_at.isoformat(),
        }
        for uc, card, artist, member in rows
    ]
    return {
        "ok": True,
        "data": {
            "summary": {
                "ownedCount": len(cards),
                "totalSlots": 9,
                "completionRate": round(len(cards) / 9 * 100),
            },
            "cards": cards,
        },
    }


@router.get("/me/wishlist")
async def wishlist(user: FanUser, session: DbSession) -> dict:
    """Return the fan's saved card types from durable server state."""
    card_ids = (
        await session.scalars(
            select(FanWishlistItem.card_id)
            .where(FanWishlistItem.user_id == user.id)
            .order_by(FanWishlistItem.created_at.desc(), FanWishlistItem.id.desc())
        )
    ).all()
    return {"ok": True, "data": {"items": [{"cardId": card_id} for card_id in card_ids]}}


@router.put("/me/wishlist/{card_id}")
async def add_wishlist(card_id: str, user: FanUser, session: DbSession) -> dict:
    owned = await session.scalar(
        select(UserCard.id).where(UserCard.user_id == user.id, UserCard.card_id == card_id)
    )
    if owned is None:
        raise AppError(404, "CARD_NOT_OWNED", "보유한 카드만 관심 카드로 저장할 수 있습니다.")
    existing = await session.scalar(
        select(FanWishlistItem).where(
            FanWishlistItem.user_id == user.id, FanWishlistItem.card_id == card_id
        )
    )
    if existing is None:
        session.add(
            FanWishlistItem(id=f"wishlist_{uuid4().hex[:12]}", user_id=user.id, card_id=card_id)
        )
        await session.commit()
    return {"ok": True, "data": {"cardId": card_id, "saved": True}}


@router.delete("/me/wishlist/{card_id}")
async def remove_wishlist(card_id: str, user: FanUser, session: DbSession) -> dict:
    item = await session.scalar(
        select(FanWishlistItem).where(
            FanWishlistItem.user_id == user.id, FanWishlistItem.card_id == card_id
        )
    )
    if item is not None:
        await session.delete(item)
        await session.commit()
    return {"ok": True, "data": {"cardId": card_id, "saved": False}}


async def _collection_goal_data(goal: CollectionGoal, user: FanUser, session: DbSession) -> dict:
    pack = await session.get(CardPack, goal.pack_id)
    if pack is None:
        raise AppError(404, "CARD_PACK_NOT_FOUND", "카드팩을 찾을 수 없습니다.")
    target_count = goal.target_count
    card_ids = select(CardPackCard.card_id).where(
        CardPackCard.pack_id == pack.id, CardPackCard.enabled.is_(True)
    )
    owned_count = int(
        await session.scalar(
            select(func.count(func.distinct(UserCard.card_id)))
            .select_from(UserCard)
            .outerjoin(
                CardCombinationMaterial,
                CardCombinationMaterial.user_card_id == UserCard.id,
            )
            .where(
                UserCard.user_id == user.id,
                UserCard.card_id.in_(card_ids),
                CardCombinationMaterial.id.is_(None),
            )
        )
        or 0
    )
    completion_rate = min(100, round(owned_count / target_count * 100)) if target_count else 0
    if completion_rate == 100 and goal.completed_at is None:
        goal.completed_at = datetime.now(UTC)
        await notify_user_once(
            session,
            user_id=user.id,
            kind="collection_goal_completed",
            title="수집 목표를 달성했어요",
            body=f"{pack.name} 카드팩 수집 목표를 모두 달성했습니다.",
            entity_type="collection_goal",
            entity_id=goal.id,
            event_key=f"collection-goal-completed:{goal.id}",
        )
    return {
        "id": goal.id,
        "packId": pack.id,
        "packName": pack.name,
        "seasonName": pack.season_name,
        "targetCount": target_count,
        "ownedCount": owned_count,
        "completionRate": completion_rate,
        "completedAt": goal.completed_at.isoformat() if goal.completed_at else None,
        "createdAt": goal.created_at.isoformat(),
    }


@router.get("/me/collection-goals")
async def collection_goals(user: FanUser, session: DbSession) -> dict:
    goals = (
        await session.scalars(
            select(CollectionGoal)
            .where(CollectionGoal.user_id == user.id)
            .order_by(CollectionGoal.created_at.desc(), CollectionGoal.id.desc())
        )
    ).all()
    items = [await _collection_goal_data(goal, user, session) for goal in goals]
    if session.dirty or session.new:
        await session.commit()
    return {"ok": True, "data": {"items": items}}


@router.post("/me/collection-goals", status_code=status.HTTP_201_CREATED)
async def create_collection_goal(
    payload: CollectionGoalCreate, user: FanUser, session: DbSession
) -> dict:
    pack = await session.scalar(
        select(CardPack).where(CardPack.id == payload.pack_id, CardPack.status == "published")
    )
    if pack is None:
        raise AppError(404, "CARD_PACK_NOT_FOUND", "공개된 카드팩을 찾을 수 없습니다.")
    available_count = int(
        await session.scalar(
            select(func.count())
            .select_from(CardPackCard)
            .where(CardPackCard.pack_id == pack.id, CardPackCard.enabled.is_(True))
        )
        or 0
    )
    target_count = payload.target_count or available_count
    if target_count > available_count:
        raise AppError(
            422, "INVALID_COLLECTION_GOAL", "카드팩에 포함된 카드 수를 초과할 수 없습니다."
        )
    goal = await session.scalar(
        select(CollectionGoal).where(
            CollectionGoal.user_id == user.id, CollectionGoal.pack_id == pack.id
        )
    )
    if goal is None:
        goal = CollectionGoal(
            id=f"collection_goal_{uuid4().hex[:12]}",
            user_id=user.id,
            pack_id=pack.id,
            target_count=target_count,
        )
        session.add(goal)
    else:
        goal.target_count = target_count
        goal.completed_at = None
    await session.flush()
    data = await _collection_goal_data(goal, user, session)
    await session.commit()
    return {"ok": True, "data": data}


@router.delete("/me/collection-goals/{goal_id}")
async def delete_collection_goal(goal_id: str, user: FanUser, session: DbSession) -> dict:
    goal = await session.scalar(
        select(CollectionGoal).where(
            CollectionGoal.id == goal_id, CollectionGoal.user_id == user.id
        )
    )
    if goal is not None:
        await session.delete(goal)
        await session.commit()
    return {"ok": True, "data": {"id": goal_id, "deleted": goal is not None}}


@router.get("/catalog/card-packs")
async def catalog_card_packs(
    session: DbSession,
    artist_id: str | None = Query(default=None, alias="artistId"),
) -> dict:
    filters = [CardPack.status == "published"]
    if artist_id:
        filters.append(CardPack.artist_id == artist_id)
    packs = list(
        await session.scalars(
            select(CardPack).where(*filters).order_by(CardPack.published_at.desc(), CardPack.id)
        )
    )
    items = []
    for pack in packs:
        rows = list(
            await session.execute(
                select(CardPackCard, Card)
                .join(Card, CardPackCard.card_id == Card.id)
                .outerjoin(Drop, Card.drop_id == Drop.id)
                .where(
                    CardPackCard.pack_id == pack.id,
                    CardPackCard.enabled.is_(True),
                    pack_card_release_visible(),
                )
                .order_by(CardPackCard.position, CardPackCard.id)
            )
        )
        items.append(
            public_card_pack_data(pack, [public_pack_card_data(link, card) for link, card in rows])
        )
    return {"ok": True, "data": {"items": items}}


@router.get("/catalog/card-packs/{pack_id}/odds")
async def catalog_card_pack_odds(pack_id: str, session: DbSession) -> dict:
    pack = await session.get(CardPack, pack_id)
    if pack is None or pack.status != "published":
        raise AppError(404, "CARD_PACK_NOT_FOUND", "공개된 카드팩을 찾을 수 없습니다.")
    rows = list(
        await session.execute(
            select(CardPackCard, Card)
            .join(Card, CardPackCard.card_id == Card.id)
            .outerjoin(Drop, Card.drop_id == Drop.id)
            .where(
                CardPackCard.pack_id == pack.id,
                CardPackCard.enabled.is_(True),
                pack_card_release_visible(),
            )
            .order_by(CardPackCard.position, CardPackCard.id)
        )
    )
    return {
        "ok": True,
        "data": {
            "pack": public_card_pack_data(pack, []),
            "items": [public_pack_card_data(link, card) for link, card in rows],
            "totalProbability": round(sum(link.probability for link, _ in rows), 6),
        },
    }


@router.post("/me/card-packs/{pack_id}/open", status_code=status.HTTP_201_CREATED)
async def open_card_pack(
    pack_id: str,
    user: FanUser,
    session: DbSession,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> dict:
    user_id = user.id
    if session.in_transaction():
        await session.rollback()
    async with session.begin():
        pack = await session.scalar(
            select(CardPack)
            .where(CardPack.id == pack_id, CardPack.status == "published")
            .with_for_update()
        )
        if pack is None:
            raise AppError(404, "CARD_PACK_NOT_FOUND", "공개된 카드팩을 찾을 수 없습니다.")
        if idempotency_key:
            existing = await session.scalar(
                select(CardPackOpening)
                .where(
                    CardPackOpening.user_id == user_id,
                    CardPackOpening.pack_id == pack.id,
                    CardPackOpening.idempotency_key == idempotency_key,
                )
                .with_for_update()
            )
            if existing and existing.user_card_id:
                existing_card = await session.get(UserCard, existing.user_card_id)
                existing_link = await session.scalar(
                    select(CardPackCard).where(
                        CardPackCard.pack_id == pack.id,
                        CardPackCard.card_id == existing.card_id,
                    )
                )
                existing_card_row = await session.get(Card, existing.card_id)
                if existing_card and existing_link and existing_card_row:
                    return {
                        "ok": True,
                        "data": {
                            "openingId": existing.id,
                            "issuanceCode": existing.issuance_code,
                            "userCardId": existing_card.id,
                            "packId": pack.id,
                            "cardId": existing_card_row.id,
                            "serialNumber": existing_card.serial_number,
                            "probability": existing_link.probability,
                            "card": public_pack_card_data(existing_link, existing_card_row),
                        },
                    }
        rows = list(
            await session.execute(
                select(CardPackCard, Card)
                .join(Card, CardPackCard.card_id == Card.id)
                .outerjoin(Drop, Card.drop_id == Drop.id)
                .where(
                    CardPackCard.pack_id == pack.id,
                    CardPackCard.enabled.is_(True),
                    pack_card_release_visible(),
                )
                .order_by(CardPackCard.position, CardPackCard.id)
            )
        )
        if not rows or abs(sum(link.probability for link, _ in rows) - 100) > 0.001:
            raise AppError(409, "INVALID_PACK_ODDS", "이 카드팩의 공개 확률표가 유효하지 않습니다.")
        if any(card.status != "published" for _, card in rows):
            raise AppError(
                409, "PACK_CARDS_NOT_PUBLISHED", "카드팩에 공개되지 않은 카드가 포함되어 있습니다."
            )
        draw = secrets.SystemRandom().uniform(0, 100)
        cursor = 0.0
        selected_link, selected_card = rows[-1]
        for link, card in rows:
            cursor += link.probability
            if draw <= cursor:
                selected_link, selected_card = link, card
                break
        locked_card = await session.scalar(
            select(Card).where(Card.id == selected_card.id).with_for_update()
        )
        if locked_card is None:
            raise AppError(409, "CARD_NOT_FOUND", "선택된 카드가 존재하지 않습니다.")
        issuance_code = f"PF-{secrets.token_hex(16).upper()}"
        opening = CardPackOpening(
            id=f"opening_{uuid4().hex[:12]}",
            user_id=user_id,
            pack_id=pack.id,
            card_id=locked_card.id,
            idempotency_key=idempotency_key,
            issuance_code=issuance_code,
        )
        user_card = await grant_user_card(
            session,
            user_id=user_id,
            card_id=locked_card.id,
            source_type="card_pack_opening",
            source_id=opening.id,
            acquisition_source="card_pack",
            drop_id=locked_card.drop_id,
            metadata={"packId": pack.id, "issuanceCode": issuance_code},
        )
        opening.user_card_id = user_card.id
        session.add(opening)
        event = await record_engagement_event(
            session,
            user_id=user_id,
            kind="card_collected",
            source_type="user_card",
            source_id=user_card.id,
            payload={
                "cardId": locked_card.id,
                "artistId": locked_card.artist_id,
                "memberId": locked_card.member_id,
                "packId": pack.id,
                "source": "card_pack",
            },
        )
        await record_audit(
            session,
            actor_user_id=user_id,
            action="card_pack.opened",
            entity_type="card_pack_opening",
            entity_id=opening.id,
            artist_id=pack.artist_id,
            details={
                "cardId": locked_card.id,
                "userCardId": user_card.id,
                "engagementEventId": event.id,
            },
        )
        await notify_user_once(
            session,
            user_id=user_id,
            kind="card_pack_opened",
            title="카드팩에서 새 카드를 얻었어요",
            body=f"{locked_card.name} 카드가 내 컬렉션에 추가되었습니다.",
            entity_type="user_card",
            entity_id=user_card.id,
            event_key=f"pack-opening:{opening.id}",
        )
    return {
        "ok": True,
        "data": {
            "openingId": opening.id,
            "issuanceCode": opening.issuance_code,
            "userCardId": user_card.id,
            "packId": pack.id,
            "cardId": locked_card.id,
            "serialNumber": user_card.serial_number,
            "probability": selected_link.probability,
            "card": public_pack_card_data(selected_link, locked_card),
        },
    }


@router.get("/me/cards/{user_card_id}/history")
async def card_acquisition_history(user_card_id: str, user: FanUser, session: DbSession) -> dict:
    """Return immutable acquisition and ownership events for one owned card."""
    user_card = await session.scalar(
        select(UserCard).where(UserCard.id == user_card_id, UserCard.user_id == user.id)
    )
    if user_card is None:
        raise AppError(404, "USER_CARD_NOT_FOUND", "내 카드에서 찾을 수 없습니다.")
    events = await session.scalars(
        select(CardOwnershipLedger)
        .where(CardOwnershipLedger.user_card_id == user_card_id)
        .order_by(CardOwnershipLedger.created_at.desc(), CardOwnershipLedger.id.desc())
    )
    return {
        "ok": True,
        "data": {
            "userCardId": user_card_id,
            "items": [
                {
                    "id": event.id,
                    "action": event.action,
                    "sourceType": event.source_type,
                    "sourceId": event.source_id,
                    "fromUserId": event.from_user_id,
                    "toUserId": event.to_user_id,
                    "metadata": event.metadata_json or {},
                    "createdAt": event.created_at.isoformat(),
                }
                for event in events
            ],
        },
    }


@router.get("/me/progression")
async def progression(
    user: FanUser,
    session: DbSession,
    artist_id: str | None = Query(default=None, alias="artistId"),
    scope: str | None = Query(default=None),
) -> dict:
    return {
        "ok": True,
        "data": await fan_progression_data(
            session, user.id, artist_id=artist_id, global_scope=scope == "global"
        ),
    }


@router.get("/me/pass")
async def fan_pass(
    user: FanUser,
    session: DbSession,
    artist_id: str | None = Query(default=None, alias="artistId"),
    scope: str | None = Query(default=None),
) -> dict:
    return {
        "ok": True,
        "data": await fan_pass_data(
            session, user_id=user.id, artist_id=artist_id, global_scope=scope == "global"
        ),
    }


@router.post("/me/pass-tiers/{tier_id}/claim")
async def claim_fan_pass_tier(tier_id: str, user: FanUser, session: DbSession) -> dict:
    return {"ok": True, "data": await claim_pass_tier(session, user_id=user.id, tier_id=tier_id)}


@router.post("/me/rewards/{grant_id}/claim")
async def claim_reward(grant_id: str, user: FanUser, session: DbSession) -> dict:
    return {
        "ok": True,
        "data": await claim_reward_grant(session, user_id=user.id, grant_id=grant_id),
    }


@router.post("/me/rewards/reconcile-pass")
async def reconcile_pass_rewards(user: FanUser, session: DbSession) -> dict:
    return {
        "ok": True,
        "data": {
            "repairedCount": await reconcile_claimed_global_pass_reward_grants(
                session, user_id=user.id
            )
        },
    }


@router.put("/me/profile/equipment")
async def equip_profile(payload: ProfileEquipmentUpdate, user: FanUser, session: DbSession) -> dict:
    return {
        "ok": True,
        "data": await update_profile_equipment(session, user_id=user.id, payload=payload),
    }


@router.get("/me/collection/benefits")
async def collection_benefits(user: FanUser, session: DbSession) -> dict:
    """Calculate collection-set progress without consuming the fan's cards.

    The first MVP rule groups published official cards by artist and season.
    Completing every card in a group unlocks a digital bonus preview. The
    rule is derived from the catalog, so adding a card automatically changes
    the required set size without a separate write-side configuration table.
    """
    owned_card_ids = set(
        (await session.scalars(select(UserCard.card_id).where(UserCard.user_id == user.id))).all()
    )
    campaigns = (
        await session.scalars(
            select(CollectionCampaign)
            .where(CollectionCampaign.status == "active")
            .order_by(CollectionCampaign.name)
        )
    ).all()
    if campaigns:
        artist_ids = {campaign.artist_id for campaign in campaigns if campaign.artist_id}
        artists = {
            artist.id: artist
            for artist in await session.scalars(select(Artist).where(Artist.id.in_(artist_ids)))
        }
        claims = await session.scalars(
            select(CollectionBenefitClaim).where(
                CollectionBenefitClaim.user_id == user.id,
                CollectionBenefitClaim.campaign_id.in_([campaign.id for campaign in campaigns]),
            )
        )
        claim_by_campaign = {claim.campaign_id: claim for claim in claims}
        return {
            "ok": True,
            "data": {
                "items": [
                    {
                        "campaignId": campaign.id,
                        "artistId": campaign.artist_id,
                        "artistName": artists[campaign.artist_id].name
                        if campaign.artist_id in artists
                        else "Fanfolio",
                        "seasonName": campaign.season_name or "기본 컬렉션",
                        "requiredCount": len(campaign.required_card_ids),
                        "ownedCount": sum(
                            card_id in owned_card_ids for card_id in campaign.required_card_ids
                        ),
                        "completionRate": round(
                            sum(card_id in owned_card_ids for card_id in campaign.required_card_ids)
                            / len(campaign.required_card_ids)
                            * 100
                        ),
                        "status": "unlocked"
                        if all(card_id in owned_card_ids for card_id in campaign.required_card_ids)
                        else "locked",
                        "claimed": campaign.id in claim_by_campaign,
                        "claimedAt": (
                            claim_by_campaign[campaign.id]
                            .claimed_at.replace(tzinfo=UTC)
                            .isoformat()
                            if campaign.id in claim_by_campaign
                            else None
                        ),
                        "claimable": (
                            all(card_id in owned_card_ids for card_id in campaign.required_card_ids)
                            and campaign.id not in claim_by_campaign
                        ),
                        "downloadUrl": (
                            download_url(
                                user_id=user.id,
                                campaign_id=campaign.id,
                                asset_id=campaign.benefit_asset_id,
                            )
                            if campaign.id in claim_by_campaign and campaign.benefit_asset_id
                            else None
                        ),
                        "benefit": {
                            "type": "digital_bonus",
                            "title": campaign.benefit_title,
                            "description": campaign.benefit_description,
                        },
                    }
                    for campaign in campaigns
                ]
            },
        }

    catalog_rows = (
        await session.execute(
            select(Card, Artist)
            .select_from(Card)
            .outerjoin(Artist, Card.artist_id == Artist.id)
            .outerjoin(Drop, Card.drop_id == Drop.id)
            .where(
                Card.status == "published", Card.is_official.is_(True), catalog_release_visible()
            )
            .order_by(Card.artist_id, Card.season_name, Card.id)
        )
    ).all()
    groups: dict[tuple[str, str], dict] = {}
    for card, artist in catalog_rows:
        artist_id = card.artist_id or "fanfolio"
        season_name = card.season_name or "기본 컬렉션"
        key = (artist_id, season_name)
        group = groups.setdefault(
            key,
            {
                "artistId": card.artist_id,
                "artistName": artist.name if artist else "Fanfolio",
                "seasonName": season_name,
                "cardIds": [],
            },
        )
        group["cardIds"].append(card.id)

    items = []
    for group in groups.values():
        required_count = len(group["cardIds"])
        owned_count = sum(card_id in owned_card_ids for card_id in group["cardIds"])
        completed = owned_count == required_count
        items.append(
            {
                "artistId": group["artistId"],
                "artistName": group["artistName"],
                "seasonName": group["seasonName"],
                "requiredCount": required_count,
                "ownedCount": owned_count,
                "completionRate": round(owned_count / required_count * 100),
                "status": "unlocked" if completed else "locked",
                "claimed": False,
                "claimedAt": None,
                "claimable": False,
                "downloadUrl": None,
                "benefit": {
                    "type": "digital_bonus",
                    "title": f"{group['artistName']} {group['seasonName']} 완성 특전",
                    "description": "컬렉션을 완성하면 디지털 특전이 해금됩니다.",
                },
            }
        )
    return {"ok": True, "data": {"items": items}}


@router.post("/me/collection/benefits/{campaign_id}/claim", status_code=status.HTTP_201_CREATED)
async def claim_collection_benefit(campaign_id: str, user: FanUser, session: DbSession) -> dict:
    campaign = await session.get(CollectionCampaign, campaign_id)
    if campaign is None:
        raise AppError(404, "CAMPAIGN_NOT_FOUND", "컬렉션 캠페인을 찾을 수 없습니다.")
    if campaign.status != "active":
        raise AppError(409, "CAMPAIGN_NOT_ACTIVE", "현재 수령할 수 없는 캠페인입니다.")

    existing = await session.scalar(
        select(CollectionBenefitClaim).where(
            CollectionBenefitClaim.user_id == user.id,
            CollectionBenefitClaim.campaign_id == campaign.id,
        )
    )
    if existing is not None:
        raise AppError(409, "BENEFIT_ALREADY_CLAIMED", "이 특전은 이미 수령했습니다.")

    owned_card_ids = set(
        (await session.scalars(select(UserCard.card_id).where(UserCard.user_id == user.id))).all()
    )
    if not all(card_id in owned_card_ids for card_id in campaign.required_card_ids):
        raise AppError(409, "BENEFIT_NOT_UNLOCKED", "컬렉션을 완성한 뒤 특전을 수령할 수 있습니다.")

    claim = CollectionBenefitClaim(
        id=f"claim_{uuid4().hex[:12]}",
        user_id=user.id,
        campaign_id=campaign.id,
        claimed_at=datetime.now(UTC),
    )
    session.add(claim)
    await record_audit(
        session,
        actor_user_id=user.id,
        action="collection_benefit.claimed",
        entity_type="collection_campaign",
        entity_id=campaign.id,
        details={"userId": user.id, "claimId": claim.id},
    )
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise AppError(409, "BENEFIT_ALREADY_CLAIMED", "이 특전은 이미 수령했습니다.")
    return {
        "ok": True,
        "data": {
            "campaignId": campaign.id,
            "claimId": claim.id,
            "claimedAt": claim.claimed_at.isoformat(),
            "downloadUrl": (
                download_url(
                    user_id=user.id,
                    campaign_id=campaign.id,
                    asset_id=campaign.benefit_asset_id,
                )
                if campaign.benefit_asset_id
                else None
            ),
            "benefit": {
                "type": "digital_bonus",
                "title": campaign.benefit_title,
                "description": campaign.benefit_description,
            },
        },
    }


@router.get("/me/collection/benefits/{campaign_id}/download")
async def download_collection_benefit(
    campaign_id: str,
    user: OptionalCurrentUser,
    session: DbSession,
    token: str | None = Query(default=None),
) -> Response:
    token_data = verify_download_token(token) if token else None
    if token_data and not token_data.get("campaignId") == campaign_id:
        raise AppError(401, "SIGNED_URL_INVALID", "유효하지 않은 다운로드 링크입니다.")
    effective_user_id = token_data.get("userId") if token_data else user.id if user else None
    if not effective_user_id:
        raise AppError(401, "AUTH_REQUIRED", "로그인이 필요합니다.")
    if user and user.id != effective_user_id:
        raise AppError(403, "SIGNED_URL_USER_MISMATCH", "이 다운로드 링크를 사용할 수 없습니다.")
    campaign = await session.get(CollectionCampaign, campaign_id)
    if campaign is None:
        raise AppError(404, "CAMPAIGN_NOT_FOUND", "컬렉션 캠페인을 찾을 수 없습니다.")
    if token_data and token_data.get("assetId") != campaign.benefit_asset_id:
        raise AppError(401, "SIGNED_URL_INVALID", "유효하지 않은 다운로드 링크입니다.")
    claim = await session.scalar(
        select(CollectionBenefitClaim).where(
            CollectionBenefitClaim.user_id == effective_user_id,
            CollectionBenefitClaim.campaign_id == campaign.id,
        )
    )
    if claim is None:
        raise AppError(403, "BENEFIT_NOT_CLAIMED", "특전을 먼저 수령해 주세요.")
    if not campaign.benefit_asset_id:
        raise AppError(404, "BENEFIT_ASSET_NOT_FOUND", "아직 다운로드할 특전 파일이 없습니다.")
    asset = await session.get(Asset, campaign.benefit_asset_id)
    storage = configured_asset_storage()
    if asset is None or not asset.storage_path or not storage.exists(asset.storage_path):
        raise AppError(404, "BENEFIT_ASSET_NOT_READY", "특전 파일이 아직 준비되지 않았습니다.")
    await record_audit(
        session,
        actor_user_id=effective_user_id,
        action="collection_benefit.downloaded",
        entity_type="collection_campaign",
        entity_id=campaign.id,
        details={"claimId": claim.id, "assetId": asset.id},
    )
    await session.commit()
    media_type = asset.content_type or "application/octet-stream"
    filename = asset.file_name or f"{campaign.id}-benefit"
    return storage_response(storage, asset.storage_path, media_type=media_type, filename=filename)


@router.patch("/me/profile")
async def update_profile(payload: ProfileUpdate, user: FanUser, session: DbSession) -> dict:
    nickname = payload.nickname.strip()
    if not nickname:
        raise AppError(422, "INVALID_NICKNAME", "닉네임을 입력해 주세요.")
    nickname_taken = await session.scalar(
        select(User.id).where(
            User.role == Role.FAN,
            User.id != user.id,
            func.lower(User.nickname) == nickname.lower(),
        )
    )
    if nickname_taken is not None:
        raise AppError(409, "NICKNAME_ALREADY_TAKEN", "이미 사용 중인 닉네임입니다.")
    await validate_favorites(
        artist_ids=payload.favorite_artist_ids,
        member_ids=payload.favorite_member_ids,
        session=session,
    )
    (
        user.nickname,
        user.favorite_artist_ids,
        user.favorite_member_ids,
        user.profile_image_url,
        user.onboarding_completed,
    ) = (
        nickname,
        payload.favorite_artist_ids,
        payload.favorite_member_ids,
        payload.profile_image_url,
        True,
    )
    await session.commit()
    return {
        "ok": True,
        "data": {
            "nickname": user.nickname,
            "favoriteArtistIds": user.favorite_artist_ids,
            "favoriteMemberIds": user.favorite_member_ids,
            "profileImageUrl": user.profile_image_url,
            "onboardingCompleted": True,
        },
    }


async def validate_favorites(
    *, artist_ids: list[str], member_ids: list[str], session: DbSession
) -> None:
    """Reject onboarding preferences that cannot describe the catalog.

    The UI loads members after a group is selected, but this check is still
    required at the API boundary because clients can be stale or manipulated.
    """
    if artist_ids:
        known_artist_ids = set(
            (await session.scalars(select(Artist.id).where(Artist.id.in_(artist_ids)))).all()
        )
        if known_artist_ids != set(artist_ids):
            raise AppError(422, "INVALID_FAVORITE_ARTIST", "선택한 그룹을 찾을 수 없습니다.")
    if not member_ids:
        return
    members = (
        await session.execute(select(Member.id, Member.artist_id).where(Member.id.in_(member_ids)))
    ).all()
    if len(members) != len(set(member_ids)):
        raise AppError(422, "INVALID_FAVORITE_MEMBER", "선택한 멤버를 찾을 수 없습니다.")
    favorite_artist_ids = set(artist_ids)
    if any(artist_id not in favorite_artist_ids for _, artist_id in members):
        raise AppError(
            422, "FAVORITE_MEMBER_ARTIST_MISMATCH", "멤버와 그룹을 올바르게 선택해 주세요."
        )


@router.get("/me/notification-preferences")
async def notification_preferences(user: FanUser) -> dict:
    return {"ok": True, "data": {"emailEnabled": user.notification_email_enabled}}


@router.get("/me/event-applications")
async def my_event_applications(user: FanUser, session: DbSession) -> dict:
    rows = (
        await session.execute(
            select(EventApplication, Event)
            .join(Event, EventApplication.event_id == Event.id)
            .where(EventApplication.user_id == user.id)
            .order_by(EventApplication.created_at.desc(), EventApplication.id.desc())
        )
    ).all()
    return {
        "ok": True,
        "data": {
            "items": [
                {
                    "applicationId": application.id,
                    "eventId": event.id,
                    "status": application.status,
                    "createdAt": application.created_at.isoformat(),
                    "event": {
                        "id": event.id,
                        "title": event.title,
                        "summary": event.summary,
                        "startsAt": event.starts_at.isoformat(),
                        "endsAt": event.ends_at.isoformat() if event.ends_at else None,
                        "venue": event.venue,
                    },
                }
                for application, event in rows
            ]
        },
    }


@router.patch("/me/notification-preferences")
async def update_notification_preferences(
    payload: NotificationPreferencesUpdate, user: FanUser, session: DbSession
) -> dict:
    user.notification_email_enabled = payload.email_enabled
    await session.commit()
    return {"ok": True, "data": {"emailEnabled": user.notification_email_enabled}}


@router.get("/me/cards/{user_card_id}")
async def card_detail(user_card_id: str, user: FanUser, session: DbSession) -> dict:
    row = (
        await session.execute(
            select(UserCard, Card, Artist, Member, Drop)
            .select_from(UserCard)
            .join(Card, UserCard.card_id == Card.id)
            .outerjoin(Artist, Card.artist_id == Artist.id)
            .outerjoin(Member, Card.member_id == Member.id)
            .outerjoin(Drop, UserCard.drop_id == Drop.id)
            .where(UserCard.id == user_card_id, UserCard.user_id == user.id)
        )
    ).one_or_none()
    if not row:
        raise AppError(404, "USER_CARD_NOT_FOUND", "카드를 찾을 수 없습니다.")
    uc, card, artist, member, drop = row
    approved_effect = await session.scalar(
        select(CardEffectVersion)
        .where(CardEffectVersion.card_id == card.id, CardEffectVersion.status == "approved")
        .order_by(CardEffectVersion.version.desc())
    )
    has_effect_versions = bool(
        await session.scalar(
            select(func.count(CardEffectVersion.id)).where(CardEffectVersion.card_id == card.id)
        )
    )
    public_design_config = card.design_config
    if has_effect_versions:
        public_design_config = approved_effect.design_config if approved_effect else None
    handwriting_image_url = None
    if card.handwriting_asset_id:
        handwriting_asset = await session.get(Asset, card.handwriting_asset_id)
        if handwriting_asset and (
            handwriting_asset.processed_storage_path or handwriting_asset.storage_path
        ):
            handwriting_image_url = f"/api/me/cards/{uc.id}/handwriting?client=fan"
    voice_audio_url = None
    if card.voice_asset_id:
        voice_asset = await session.get(Asset, card.voice_asset_id)
        if voice_asset and (voice_asset.processed_storage_path or voice_asset.storage_path):
            voice_audio_url = f"/api/me/cards/{uc.id}/voice?client=fan"
    video_url = None
    if card.video_asset_id:
        video_asset = await session.get(Asset, card.video_asset_id)
        if video_asset and (video_asset.processed_storage_path or video_asset.storage_path):
            video_url = f"/api/me/cards/{uc.id}/video?client=fan"
    lenticular_image_url = None
    front = (public_design_config or {}).get("front")
    lenticular_asset_id = front.get("lenticularAssetId") if isinstance(front, dict) else None
    if isinstance(lenticular_asset_id, str):
        lenticular_asset = await session.get(Asset, lenticular_asset_id)
        lenticular_path = (
            lenticular_storage_path(lenticular_asset)
            if is_lenticular_image_asset(lenticular_asset)
            else None
        )
        if lenticular_path and configured_asset_storage().exists(lenticular_path):
            lenticular_image_url = f"/api/me/cards/{uc.id}/lenticular?client=fan"
    return {
        "ok": True,
        "data": {
            "userCardId": uc.id,
            "serialNumber": uc.serial_number,
            "acquiredAt": uc.acquired_at.isoformat(),
            "acquisitionSource": uc.acquisition_source,
            "card": {
                "id": card.id,
                "name": card.name,
                "isOfficial": card.is_official,
                "seasonName": card.season_name,
                "cardType": card.template_id,
                "rarity": card.rarity,
                "signatureText": card.signature_text,
                "handwrittenMessage": None,
                "issueLimit": card.issue_limit,
                "status": card.status,
                "designConfig": public_design_config,
                "imageUrl": card_image_url(card),
                "artistId": artist.id if artist else card.artist_id,
                "artistName": artist.name if artist else None,
                "memberId": member.id if member else card.member_id,
                "memberName": member.name if member else None,
                "handwritingImageUrl": handwriting_image_url,
                "hasVoice": card.has_voice and voice_audio_url is not None,
                "voiceAudioUrl": voice_audio_url,
                "videoUrl": video_url,
                "hasVideo": video_url is not None,
                "lenticularImageUrl": lenticular_image_url,
            },
            "drop": {"name": drop.name} if drop else None,
            "redeemCode": None,
            "futureBenefitPreview": "이 카드는 추후 스페셜 카드 해금 조건에 사용될 수 있습니다.",
        },
    }


@router.get("/me/cards/{user_card_id}/handwriting")
async def card_handwriting(user_card_id: str, user: FanUser, session: DbSession) -> Response:
    """Serve only the handwriting asset attached to a card the fan owns."""
    row = await session.execute(
        select(UserCard, Card)
        .join(Card, UserCard.card_id == Card.id)
        .where(UserCard.id == user_card_id, UserCard.user_id == user.id)
    )
    user_card, card = row.one_or_none() or (None, None)
    if not user_card or not card or not card.handwriting_asset_id:
        raise AppError(404, "HANDWRITING_NOT_FOUND", "손글씨 특전을 찾을 수 없습니다.")
    asset = await session.get(Asset, card.handwriting_asset_id)
    path = asset.processed_storage_path or asset.storage_path if asset else None
    if not path:
        raise AppError(404, "HANDWRITING_NOT_READY", "손글씨 특전이 아직 준비되지 않았습니다.")
    return storage_response(
        configured_asset_storage(), path, media_type=asset.content_type or "image/png"
    )


@router.get("/me/cards/{user_card_id}/voice")
async def card_voice(user_card_id: str, user: FanUser, session: DbSession) -> Response:
    """Serve a voice asset only after verifying the fan owns the card."""
    row = await session.execute(
        select(UserCard, Card)
        .join(Card, UserCard.card_id == Card.id)
        .where(UserCard.id == user_card_id, UserCard.user_id == user.id)
    )
    user_card, card = row.one_or_none() or (None, None)
    if not user_card or not card or not card.voice_asset_id:
        raise AppError(404, "VOICE_NOT_FOUND", "보이스 특전을 찾을 수 없습니다.")
    asset = await session.get(Asset, card.voice_asset_id)
    path = asset.processed_storage_path or asset.storage_path if asset else None
    if not path:
        raise AppError(404, "VOICE_NOT_READY", "보이스 특전이 아직 준비되지 않았습니다.")
    return storage_response(
        configured_asset_storage(), path, media_type=asset.content_type or "audio/mpeg"
    )


@router.get("/me/cards/{user_card_id}/video")
async def card_video(user_card_id: str, user: FanUser, session: DbSession) -> Response:
    """Serve a motion layer only after verifying that the fan owns the card."""
    row = await session.execute(
        select(UserCard, Card)
        .join(Card, UserCard.card_id == Card.id)
        .where(UserCard.id == user_card_id, UserCard.user_id == user.id)
    )
    user_card, card = row.one_or_none() or (None, None)
    if not user_card or not card or not card.video_asset_id:
        raise AppError(404, "VIDEO_NOT_FOUND", "카드 영상을 찾을 수 없습니다.")
    asset = await session.get(Asset, card.video_asset_id)
    path = asset.processed_storage_path or asset.storage_path if asset else None
    if not path:
        raise AppError(404, "VIDEO_NOT_READY", "카드 영상이 아직 준비되지 않았습니다.")
    return storage_response(
        configured_asset_storage(), path, media_type=asset.content_type or "video/mp4"
    )


@router.get("/me/cards/{user_card_id}/lenticular")
async def card_lenticular(user_card_id: str, user: FanUser, session: DbSession) -> Response:
    """Serve a lenticular image only after verifying that the fan owns the card."""
    row = await session.execute(
        select(UserCard, Card)
        .join(Card, UserCard.card_id == Card.id)
        .where(UserCard.id == user_card_id, UserCard.user_id == user.id)
    )
    user_card, card = row.one_or_none() or (None, None)
    front = (card.design_config or {}).get("front") if card else None
    lenticular_asset_id = front.get("lenticularAssetId") if isinstance(front, dict) else None
    if not user_card or not card or not isinstance(lenticular_asset_id, str):
        raise AppError(404, "LENTICULAR_NOT_FOUND", "렌티큘러 이미지를 찾을 수 없습니다.")
    asset = await session.get(Asset, lenticular_asset_id)
    if not is_lenticular_image_asset(asset):
        raise AppError(404, "LENTICULAR_NOT_FOUND", "렌티큘러 이미지를 찾을 수 없습니다.")
    path = lenticular_storage_path(asset)
    if not path:
        raise AppError(
            404,
            "LENTICULAR_NOT_READY",
            "렌티큘러 이미지가 아직 준비되지 않았습니다.",
        )
    storage = configured_asset_storage()
    if not storage.exists(path):
        raise AppError(
            404,
            "LENTICULAR_NOT_READY",
            "렌티큘러 이미지가 아직 준비되지 않았습니다.",
        )
    return storage_response(storage, path, media_type=asset.content_type or "image/webp")


@router.get("/cards/{card_id}/image")
async def card_image(card_id: str, session: DbSession) -> Response:
    """Serve the image of a published card without a bearer header.

    ``<img src=...>`` requests cannot use the short-lived in-memory access
    token used by the fan SPA.  The catalog already exposes only published,
    fan-visible cards, and this route repeats that visibility check, so a
    browser image request can safely load the same public card asset without
    turning private or unreleased cards into public files.
    """
    card = await session.get(Card, card_id)
    if (
        not card
        or card.status != "published"
        or not card.image_asset_id
        or not await card_is_visible_to_fans(card, session)
    ):
        raise AppError(404, "CARD_IMAGE_NOT_FOUND", "카드 이미지를 찾을 수 없습니다.")
    asset = await session.get(Asset, card.image_asset_id)
    if not asset or not asset.storage_path:
        raise AppError(404, "CARD_IMAGE_NOT_READY", "카드 이미지가 아직 준비되지 않았습니다.")
    return storage_response(
        configured_asset_storage(),
        asset.storage_path,
        media_type=asset.content_type or "image/png",
        cache_control="public, max-age=300, s-maxage=86400, stale-while-revalidate=604800",
    )


@router.get("/rewards/{reward_id}/image")
async def reward_image(reward_id: str, session: DbSession) -> Response:
    reward = await session.get(RewardCatalog, reward_id)
    asset_id = (
        reward.metadata_.get("imageAssetId")
        if reward and isinstance(reward.metadata_, dict)
        else None
    )
    asset = await session.get(Asset, asset_id) if asset_id else None
    if (
        not reward
        or reward.status != "published"
        or not asset
        or asset.purpose != "reward_image"
        or not asset.storage_path
    ):
        raise AppError(404, "REWARD_IMAGE_NOT_FOUND", "보상 이미지를 찾을 수 없습니다.")
    return storage_response(
        configured_asset_storage(),
        asset.storage_path,
        media_type=asset.content_type or "image/png",
        cache_control="public, max-age=300, s-maxage=86400, stale-while-revalidate=604800",
    )


@router.get("/catalog/artists")
async def catalog_artists(_: FanUser, session: DbSession) -> dict:
    artists = await session.scalars(select(Artist).order_by(Artist.name))
    return {
        "ok": True,
        "data": {
            "items": [
                {"id": artist.id, "name": artist.name, "imageUrl": artist.image_url}
                for artist in artists
            ]
        },
    }


@router.get("/catalog/members")
async def catalog_members(_: FanUser, session: DbSession, artistId: str | None = None) -> dict:
    available_artist_ids = (
        select(Card.artist_id)
        .outerjoin(Drop, Card.drop_id == Drop.id)
        .where(Card.status == "published", Card.is_official.is_(True), catalog_release_visible())
    )
    filters = (
        [Member.artist_id == artistId] if artistId else [Member.artist_id.in_(available_artist_ids)]
    )
    members = await session.scalars(select(Member).where(*filters).distinct().order_by(Member.name))
    return {
        "ok": True,
        "data": {
            "items": [
                {"id": member.id, "artistId": member.artist_id, "name": member.name}
                for member in members
            ]
        },
    }


@router.get("/catalog/cards")
async def catalog(
    user: FanUser,
    session: DbSession,
    artistId: str | None = None,
    memberId: str | None = None,
    q: str | None = None,
    page: int = Query(default=1, ge=1),
    pageSize: int = Query(default=20, ge=1, le=100),
    sort: Literal["recommended", "name", "rarity"] = "recommended",
) -> dict:
    filters = [Card.status == "published", Card.is_official.is_(True), catalog_release_visible()]
    if artistId:
        filters.append(Card.artist_id == artistId)
    if memberId:
        filters.append(Card.member_id == memberId)
    if q:
        search = f"%{q}%"
        filters.append(
            or_(Card.name.ilike(search), Artist.name.ilike(search), Member.name.ilike(search))
        )
    catalog_from = (
        select(Card)
        .select_from(Card)
        .outerjoin(Artist, Card.artist_id == Artist.id)
        .outerjoin(Member, Card.member_id == Member.id)
        .outerjoin(Drop, Card.drop_id == Drop.id)
    )
    total = await session.scalar(
        select(func.count()).select_from(catalog_from.where(*filters).subquery())
    )
    recommendation_score = case(
        (Card.member_id.in_(user.favorite_member_ids), 3),
        (Card.artist_id.in_(user.favorite_artist_ids), 2),
        else_=0,
    )
    rarity_score = case(
        (Card.rarity == "Special", 4),
        (Card.rarity == "SR", 3),
        (Card.rarity == "R", 2),
        (Card.rarity == "N", 1),
        else_=0,
    )
    if sort == "name":
        ordering = (Artist.name, Member.name, Card.name, Card.id)
    elif sort == "rarity":
        ordering = (desc(rarity_score), Artist.name, Card.name, Card.id)
    else:
        ordering = (desc(recommendation_score), Artist.name, Card.name, Card.id)
    statement = (
        select(Card, Artist, Member)
        .outerjoin(Artist, Card.artist_id == Artist.id)
        .outerjoin(Member, Card.member_id == Member.id)
        .outerjoin(Drop, Card.drop_id == Drop.id)
        .where(*filters)
        .order_by(*ordering)
        .offset((page - 1) * pageSize)
        .limit(pageSize)
    )
    cards = (await session.execute(statement)).all()
    return {
        "ok": True,
        "data": {
            "items": [
                {
                    "id": c.id,
                    "status": c.status,
                    "isOfficial": c.is_official,
                    "name": c.name,
                    "imageUrl": card_image_url(c),
                    "artistId": artist.id if artist else c.artist_id,
                    "artistName": artist.name if artist else None,
                    "memberId": member.id if member else c.member_id,
                    "memberName": member.name if member else None,
                }
                for c, artist, member in cards
            ],
            "meta": {
                "pagination": {"page": page, "pageSize": pageSize, "total": total},
                "sort": sort,
            },
        },
    }


@router.get("/notifications")
async def notifications(user: FanUser, session: DbSession) -> dict:
    items = (
        await session.scalars(
            select(Notification)
            .where(Notification.user_id == user.id)
            # The notification center is a reverse-chronological feed. Do not
            # rely on database insertion order, which is not a contract and
            # can change after a migration or a different query plan.
            .order_by(Notification.created_at.desc(), Notification.id.desc())
        )
    ).all()
    return {
        "ok": True,
        "data": {
            "items": [
                {
                    "id": n.id,
                    "kind": n.kind,
                    "title": n.title,
                    "body": n.body,
                    "entityType": n.entity_type,
                    "entityId": n.entity_id,
                    "eventKey": n.event_key,
                    "isRead": n.is_read,
                    "readAt": n.read_at.isoformat() if n.read_at else None,
                    "createdAt": n.created_at.isoformat(),
                }
                for n in items
            ]
        },
    }


@router.get("/notifications/stream")
async def notification_stream(user: FanUser, session: DbSession) -> StreamingResponse:
    """Send unread and newly-created notifications over a lightweight SSE stream."""
    user_id = user.id

    async def events():
        seen_ids: set[str] = set()
        while True:
            items = (
                await session.scalars(
                    select(Notification)
                    .where(Notification.user_id == user_id, Notification.is_read.is_(False))
                    .order_by(Notification.created_at, Notification.id)
                )
            ).all()
            payloads = [
                {
                    "id": item.id,
                    "kind": item.kind,
                    "title": item.title,
                    "body": item.body,
                    "entityType": item.entity_type,
                    "entityId": item.entity_id,
                    "eventKey": item.event_key,
                    "isRead": item.is_read,
                    "readAt": item.read_at.isoformat() if item.read_at else None,
                    "createdAt": item.created_at.isoformat(),
                }
                for item in items
                if item.id not in seen_ids
            ]
            seen_ids.update(item["id"] for item in payloads)
            if session.in_transaction():
                await session.rollback()
            if payloads:
                for item in payloads:
                    yield f"event: notification\ndata: {json.dumps(item, ensure_ascii=False)}\n\n"
            else:
                yield ": keep-alive\n\n"
            await asyncio.sleep(15)

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


@router.get("/notifications/unread-count")
async def unread_notification_count(user: FanUser, session: DbSession) -> dict:
    unread_count = await session.scalar(
        select(func.count())
        .select_from(Notification)
        .where(Notification.user_id == user.id, Notification.is_read.is_(False))
    )
    return {"ok": True, "data": {"unreadCount": unread_count or 0}}


async def _read_all_notifications(user: FanUser, session: DbSession) -> dict:
    result = await session.execute(
        update(Notification)
        .where(Notification.user_id == user.id, Notification.is_read.is_(False))
        .values(is_read=True, read_at=datetime.now(UTC))
    )
    await session.commit()
    return {"ok": True, "data": {"updatedCount": result.rowcount or 0}}


@router.post("/notifications/read-all")
async def read_all_notifications(user: FanUser, session: DbSession) -> dict:
    """Mark every unread notification as read per the frontend contract."""
    return await _read_all_notifications(user, session)


@router.patch("/notifications/read-all")
async def read_all_notifications_legacy(user: FanUser, session: DbSession) -> dict:
    """Keep the original PATCH route for already-released clients."""
    return await _read_all_notifications(user, session)


@router.patch("/notifications/{notification_id}")
async def read_notification(
    notification_id: str, payload: ReadNotification, user: FanUser, session: DbSession
) -> dict:
    item = await session.scalar(
        select(Notification).where(
            Notification.id == notification_id, Notification.user_id == user.id
        )
    )
    if not item:
        raise AppError(404, "NOTIFICATION_NOT_FOUND", "알림을 찾을 수 없습니다.")
    item.is_read, item.read_at = payload.read, datetime.now(UTC) if payload.read else None
    await session.commit()
    return {
        "ok": True,
        "data": {
            "id": item.id,
            "isRead": item.is_read,
            "readAt": item.read_at.isoformat() if item.read_at else None,
        },
    }
