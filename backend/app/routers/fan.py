from datetime import UTC, datetime

from fastapi import APIRouter, Query, status
from sqlalchemy import func, select

from app.dependencies import DbSession, FanUser
from app.errors import AppError
from app.models import Card, Notification, UserCard
from app.schemas import ProfileUpdate, ReadNotification, RedemptionRequest
from app.services import redeem

router = APIRouter(prefix="/api", tags=["fan"])


@router.get("/me")
async def me(user: FanUser) -> dict:
    return {
        "ok": True,
        "data": {
            "id": user.id,
            "email": user.email,
            "role": user.role.value,
            "nickname": user.nickname,
            "favoriteArtistIds": user.favorite_artist_ids,
            "favoriteMemberIds": user.favorite_member_ids,
            "onboardingCompleted": user.onboarding_completed,
        },
    }


@router.post("/redemptions", status_code=status.HTTP_201_CREATED)
async def create_redemption(payload: RedemptionRequest, user: FanUser, session: DbSession) -> dict:
    return {"ok": True, "data": await redeem(session, user, payload.code)}


@router.get("/me/collection")
async def collection(user: FanUser, session: DbSession) -> dict:
    rows = (
        await session.execute(select(UserCard, Card).join(Card).where(UserCard.user_id == user.id))
    ).all()
    cards = [
        {
            "userCardId": uc.id,
            "cardId": card.id,
            "name": card.name,
            "imageUrl": card.image_url,
            "isOfficial": card.is_official,
            "serialNumber": uc.serial_number,
            "acquiredAt": uc.acquired_at.isoformat(),
        }
        for uc, card in rows
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


@router.patch("/me/profile")
async def update_profile(payload: ProfileUpdate, user: FanUser, session: DbSession) -> dict:
    user.nickname, user.favorite_artist_ids, user.favorite_member_ids, user.onboarding_completed = (
        payload.nickname,
        payload.favorite_artist_ids,
        payload.favorite_member_ids,
        True,
    )
    await session.commit()
    return {
        "ok": True,
        "data": {
            "nickname": user.nickname,
            "favoriteArtistIds": user.favorite_artist_ids,
            "favoriteMemberIds": user.favorite_member_ids,
            "onboardingCompleted": True,
        },
    }


@router.get("/me/cards/{user_card_id}")
async def card_detail(user_card_id: str, user: FanUser, session: DbSession) -> dict:
    row = (
        await session.execute(
            select(UserCard, Card)
            .join(Card)
            .where(UserCard.id == user_card_id, UserCard.user_id == user.id)
        )
    ).one_or_none()
    if not row:
        raise AppError(404, "USER_CARD_NOT_FOUND", "카드를 찾을 수 없습니다.")
    uc, card = row
    return {
        "ok": True,
        "data": {
            "userCardId": uc.id,
            "serialNumber": uc.serial_number,
            "acquisitionSource": "redeem_code",
            "card": {
                "id": card.id,
                "name": card.name,
                "isOfficial": card.is_official,
                "handwritingImageUrl": None,
                "hasVoice": False,
            },
        },
    }


@router.get("/catalog/cards")
async def catalog(
    user: FanUser,
    session: DbSession,
    artistId: str | None = None,
    q: str | None = None,
    page: int = Query(default=1, ge=1),
    pageSize: int = Query(default=20, ge=1, le=100),
) -> dict:
    filters = [Card.status == "published", Card.is_official.is_(True)]
    if artistId:
        filters.append(Card.artist_id == artistId)
    if q:
        filters.append(Card.name.ilike(f"%{q}%"))
    total = await session.scalar(select(func.count()).select_from(Card).where(*filters))
    statement = select(Card).where(*filters).offset((page - 1) * pageSize).limit(pageSize)
    cards = (await session.scalars(statement)).all()
    return {
        "ok": True,
        "data": {
            "items": [
                {"id": c.id, "status": c.status, "isOfficial": c.is_official, "name": c.name}
                for c in cards
            ],
            "meta": {"pagination": {"page": page, "pageSize": pageSize, "total": total}},
        },
    }


@router.get("/notifications")
async def notifications(user: FanUser, session: DbSession) -> dict:
    items = (
        await session.scalars(select(Notification).where(Notification.user_id == user.id))
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
                    "isRead": n.is_read,
                    "readAt": n.read_at.isoformat() if n.read_at else None,
                    "createdAt": n.created_at.isoformat(),
                }
                for n in items
            ]
        },
    }


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
