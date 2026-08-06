import asyncio
import json
from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Query, Request, status
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy import case, desc, func, or_, select, update

from app.dependencies import DbSession, FanUser
from app.errors import AppError
from app.models import Artist, Asset, Card, Drop, Member, Notification, UserCard
from app.rate_limit import enforce_rate_limit
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
async def create_redemption(
    payload: RedemptionRequest, request: Request, user: FanUser, session: DbSession
) -> dict:
    client_host = request.client.host if request.client else "unknown"
    await enforce_rate_limit(f"redemption:{user.id}:{client_host}", limit=10, window_seconds=60)
    return {"ok": True, "data": await redeem(session, user, payload.code, payload.source)}


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
    await validate_favorites(
        artist_ids=payload.favorite_artist_ids,
        member_ids=payload.favorite_member_ids,
        session=session,
    )
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
    handwriting_image_url = None
    if card.handwriting_asset_id:
        handwriting_asset = await session.get(Asset, card.handwriting_asset_id)
        if handwriting_asset and (
            handwriting_asset.processed_storage_path or handwriting_asset.storage_path
        ):
            handwriting_image_url = f"/api/me/cards/{uc.id}/handwriting"
    voice_audio_url = None
    if card.voice_asset_id:
        voice_asset = await session.get(Asset, card.voice_asset_id)
        if voice_asset and (voice_asset.processed_storage_path or voice_asset.storage_path):
            voice_audio_url = f"/api/me/cards/{uc.id}/voice"
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
                "imageUrl": card_image_url(card),
                "artistId": artist.id if artist else card.artist_id,
                "artistName": artist.name if artist else None,
                "memberId": member.id if member else card.member_id,
                "memberName": member.name if member else None,
                "handwritingImageUrl": handwriting_image_url,
                "hasVoice": card.has_voice and voice_audio_url is not None,
                "voiceAudioUrl": voice_audio_url,
            },
            "drop": {"name": drop.name} if drop else None,
            "redeemCode": None,
            "futureBenefitPreview": "이 카드는 추후 스페셜 카드 해금 조건에 사용될 수 있습니다.",
        },
    }


@router.get("/me/cards/{user_card_id}/handwriting")
async def card_handwriting(user_card_id: str, user: FanUser, session: DbSession) -> FileResponse:
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
    return FileResponse(path, media_type=asset.content_type or "image/png")


@router.get("/me/cards/{user_card_id}/voice")
async def card_voice(user_card_id: str, user: FanUser, session: DbSession) -> FileResponse:
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
    return FileResponse(path, media_type=asset.content_type or "audio/mpeg")


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
    sort: Literal["recommended", "name", "rarity"] = "recommended",
) -> dict:
    filters = [Card.status == "published", Card.is_official.is_(True)]
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
