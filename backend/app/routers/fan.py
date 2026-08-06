import asyncio
import json
from datetime import UTC, datetime

from fastapi import APIRouter, Query, status
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy import func, select, update

from app.dependencies import DbSession, FanUser
from app.errors import AppError
from app.models import Artist, Asset, Card, Member, Notification, UserCard
from app.schemas import (
    NotificationPreferencesUpdate,
    ProfileUpdate,
    ReadNotification,
    RedemptionRequest,
)
from app.services import redeem

router = APIRouter(prefix="/api", tags=["fan"])


def card_image_url(card: Card) -> str:
    """Use the protected asset-backed image route for artist-created cards."""
    if card.image_asset_id:
        return f"/api/cards/{card.id}/image?client=fan"
    return card.image_url


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
        await session.execute(
            select(UserCard, Card, Artist, Member)
            .select_from(UserCard)
            .join(Card, UserCard.card_id == Card.id)
            .outerjoin(Artist, Card.artist_id == Artist.id)
            .outerjoin(Member, Card.member_id == Member.id)
            .where(UserCard.user_id == user.id)
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


@router.get("/me/notification-preferences")
async def notification_preferences(user: FanUser) -> dict:
    return {"ok": True, "data": {"emailEnabled": user.notification_email_enabled}}


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
            select(UserCard, Card, Artist, Member)
            .select_from(UserCard)
            .join(Card, UserCard.card_id == Card.id)
            .outerjoin(Artist, Card.artist_id == Artist.id)
            .outerjoin(Member, Card.member_id == Member.id)
            .where(UserCard.id == user_card_id, UserCard.user_id == user.id)
        )
    ).one_or_none()
    if not row:
        raise AppError(404, "USER_CARD_NOT_FOUND", "카드를 찾을 수 없습니다.")
    uc, card, artist, member = row
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
                "imageUrl": card_image_url(card),
                "artistId": artist.id if artist else card.artist_id,
                "artistName": artist.name if artist else None,
                "memberId": member.id if member else card.member_id,
                "memberName": member.name if member else None,
                "handwritingImageUrl": None,
                "hasVoice": False,
            },
        },
    }


@router.get("/cards/{card_id}/image")
async def card_image(card_id: str, _: FanUser, session: DbSession) -> FileResponse:
    card = await session.get(Card, card_id)
    if not card or card.status != "published" or not card.image_asset_id:
        raise AppError(404, "CARD_IMAGE_NOT_FOUND", "카드 이미지를 찾을 수 없습니다.")
    asset = await session.get(Asset, card.image_asset_id)
    if not asset or not asset.storage_path:
        raise AppError(404, "CARD_IMAGE_NOT_READY", "카드 이미지가 아직 준비되지 않았습니다.")
    return FileResponse(asset.storage_path, media_type=asset.content_type or "image/png")


@router.get("/catalog/artists")
async def catalog_artists(_: FanUser, session: DbSession) -> dict:
    artists = await session.scalars(
        select(Artist)
        .join(Card, Card.artist_id == Artist.id)
        .where(Card.status == "published", Card.is_official.is_(True))
        .distinct()
        .order_by(Artist.name)
    )
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
    available_artist_ids = select(Card.artist_id).where(
        Card.status == "published", Card.is_official.is_(True)
    )
    filters = [Member.artist_id.in_(available_artist_ids)]
    if artistId:
        filters.append(Member.artist_id == artistId)
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
) -> dict:
    filters = [Card.status == "published", Card.is_official.is_(True)]
    if artistId:
        filters.append(Card.artist_id == artistId)
    if memberId:
        filters.append(Card.member_id == memberId)
    if q:
        filters.append(Card.name.ilike(f"%{q}%"))
    total = await session.scalar(select(func.count()).select_from(Card).where(*filters))
    statement = (
        select(Card, Artist, Member)
        .outerjoin(Artist, Card.artist_id == Artist.id)
        .outerjoin(Member, Card.member_id == Member.id)
        .where(*filters)
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
