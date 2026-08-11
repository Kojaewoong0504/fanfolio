from datetime import UTC, datetime
from secrets import token_urlsafe
from uuid import uuid4

from fastapi import APIRouter, Query, status
from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.exc import IntegrityError

from app.dependencies import CurrentAdmin, DbSession
from app.errors import AppError
from app.models import (
    AdminArtistAssignment,
    AdminMembership,
    Artist,
    Card,
    Organization,
    OrganizationArtist,
    RefreshToken,
    Role,
    Session,
    User,
)
from app.passwords import hash_password
from app.schemas import (
    OrganizationArtistsUpdate,
    OrganizationCreate,
    OrganizationMemberArtistsUpdate,
    OrganizationMemberCreate,
    OrganizationMemberUpdate,
    OrganizationUpdate,
)
from app.services import record_audit

router = APIRouter(prefix="/organizations")


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


async def _organization_or_404(session: DbSession, organization_id: str) -> Organization:
    organization = await session.get(Organization, organization_id)
    if organization is None:
        raise AppError(404, "RESOURCE_NOT_FOUND", "파트너를 찾을 수 없습니다.")
    return organization


async def _organization_artist_ids(session: DbSession, organization_id: str) -> set[str]:
    rows = await session.scalars(
        select(OrganizationArtist.artist_id).where(
            OrganizationArtist.organization_id == organization_id
        )
    )
    return set(rows.all())


async def _organization_data(session: DbSession, organization: Organization) -> dict:
    member_count = await session.scalar(
        select(func.count())
        .select_from(AdminMembership)
        .where(AdminMembership.organization_id == organization.id)
    )
    artist_count = await session.scalar(
        select(func.count())
        .select_from(OrganizationArtist)
        .where(OrganizationArtist.organization_id == organization.id)
    )
    card_count = await session.scalar(
        select(func.count())
        .select_from(Card)
        .join(OrganizationArtist, OrganizationArtist.artist_id == Card.artist_id)
        .where(OrganizationArtist.organization_id == organization.id)
    )
    return {
        "id": organization.id,
        "name": organization.name,
        "slug": organization.slug,
        "status": organization.status,
        "contactName": organization.contact_name,
        "contactEmail": organization.contact_email,
        "contractStartsAt": _iso(organization.contract_starts_at),
        "contractEndsAt": _iso(organization.contract_ends_at),
        "logoUrl": organization.logo_url,
        "memberCount": member_count or 0,
        "artistCount": artist_count or 0,
        "cardCount": card_count or 0,
        "createdAt": _iso(organization.created_at),
        "updatedAt": _iso(organization.updated_at),
    }


async def _member_or_404(
    session: DbSession, organization_id: str, user_id: str
) -> tuple[User, AdminMembership]:
    membership = await session.get(AdminMembership, user_id)
    if membership is None or membership.organization_id != organization_id:
        raise AppError(404, "RESOURCE_NOT_FOUND", "담당자를 찾을 수 없습니다.")
    user = await session.get(User, user_id)
    if user is None or user.role != Role.ADMIN:
        raise AppError(404, "RESOURCE_NOT_FOUND", "담당자를 찾을 수 없습니다.")
    return user, membership


async def _assigned_artists(session: DbSession, user_id: str) -> list[dict]:
    rows = (
        await session.execute(
            select(Artist)
            .join(
                AdminArtistAssignment,
                AdminArtistAssignment.artist_id == Artist.id,
            )
            .where(AdminArtistAssignment.admin_user_id == user_id)
            .order_by(Artist.name)
        )
    ).scalars()
    return [{"id": artist.id, "name": artist.name, "imageUrl": artist.image_url} for artist in rows]


async def _member_data(
    session: DbSession,
    user: User,
    membership: AdminMembership,
) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "displayName": membership.display_name,
        "accessLevel": membership.access_level,
        "status": membership.status,
        "mustChangePassword": user.must_change_password,
        "lastLoginAt": _iso(membership.last_login_at),
        "assignedArtists": await _assigned_artists(session, user.id),
    }


def _validate_contract_window(starts_at: datetime | None, ends_at: datetime | None) -> None:
    if starts_at and ends_at and ends_at <= starts_at:
        raise AppError(422, "INVALID_CONTRACT_WINDOW", "계약 종료일을 시작일 이후로 설정해 주세요.")


async def _validate_artist_subset(
    session: DbSession,
    organization_id: str,
    artist_ids: list[str],
) -> list[str]:
    normalized = list(dict.fromkeys(artist_ids))
    allowed = await _organization_artist_ids(session, organization_id)
    if not set(normalized) <= allowed:
        raise AppError(
            409,
            "ARTIST_OUTSIDE_ORGANIZATION",
            "파트너에 연결되지 않은 아티스트는 담당자에게 배정할 수 없습니다.",
        )
    return normalized


@router.get("")
async def list_organizations(
    context: CurrentAdmin,
    session: DbSession,
    query: str | None = None,
    organization_status: str | None = Query(default=None, alias="status"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, alias="pageSize", ge=1, le=100),
) -> dict:
    context.require_root()
    filters = []
    if query:
        search = f"%{query}%"
        filters.append(
            or_(
                Organization.name.ilike(search),
                Organization.slug.ilike(search),
                Organization.contact_email.ilike(search),
            )
        )
    if organization_status:
        filters.append(Organization.status == organization_status)
    total = await session.scalar(select(func.count()).select_from(Organization).where(*filters))
    organizations = (
        await session.scalars(
            select(Organization)
            .where(*filters)
            .order_by(Organization.status, Organization.name)
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()
    return {
        "ok": True,
        "data": {
            "items": [
                await _organization_data(session, organization) for organization in organizations
            ],
            "meta": {
                "pagination": {
                    "page": page,
                    "pageSize": page_size,
                    "total": total or 0,
                }
            },
        },
    }


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_organization(
    payload: OrganizationCreate,
    context: CurrentAdmin,
    session: DbSession,
) -> dict:
    context.require_root()
    existing = await session.scalar(select(Organization).where(Organization.slug == payload.slug))
    if existing:
        raise AppError(409, "ORGANIZATION_SLUG_TAKEN", "이미 사용 중인 파트너 식별자입니다.")
    _validate_contract_window(payload.contract_starts_at, payload.contract_ends_at)
    organization = Organization(
        id=f"org_{uuid4().hex[:12]}",
        **payload.model_dump(exclude_unset=True, by_alias=False),
    )
    session.add(organization)
    await record_audit(
        session,
        actor_user_id=context.user.id,
        action="organization.created",
        entity_type="organization",
        entity_id=organization.id,
        organization_id=organization.id,
        details={"slug": organization.slug},
    )
    try:
        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        # The preflight lookup above prevents the usual duplicate case, but
        # the unique constraint is still the final authority under a race.
        # Convert that database failure into the same actionable API contract.
        if "slug" in str(error.orig).lower():
            raise AppError(
                409, "ORGANIZATION_SLUG_TAKEN", "이미 사용 중인 파트너 식별자입니다."
            ) from error
        raise AppError(
            409,
            "ORGANIZATION_CONFLICT",
            "파트너 정보를 저장할 수 없습니다. 입력값을 확인해 주세요.",
        ) from error
    return {"ok": True, "data": await _organization_data(session, organization)}


@router.get("/{organization_id}")
async def get_organization(
    organization_id: str,
    context: CurrentAdmin,
    session: DbSession,
) -> dict:
    context.require_root()
    organization = await _organization_or_404(session, organization_id)
    data = await _organization_data(session, organization)
    artist_ids = await _organization_artist_ids(session, organization.id)
    if artist_ids:
        artists = await session.scalars(
            select(Artist).where(Artist.id.in_(artist_ids)).order_by(Artist.name)
        )
        data["artists"] = [
            {"id": artist.id, "name": artist.name, "imageUrl": artist.image_url}
            for artist in artists
        ]
    else:
        data["artists"] = []
    return {"ok": True, "data": data}


@router.patch("/{organization_id}")
async def update_organization(
    organization_id: str,
    payload: OrganizationUpdate,
    context: CurrentAdmin,
    session: DbSession,
) -> dict:
    context.require_root()
    organization = await _organization_or_404(session, organization_id)
    values = payload.model_dump(exclude_unset=True, by_alias=False)
    slug = values.get("slug")
    if slug and slug != organization.slug:
        existing = await session.scalar(select(Organization).where(Organization.slug == slug))
        if existing:
            raise AppError(
                409,
                "ORGANIZATION_SLUG_TAKEN",
                "이미 사용 중인 파트너 식별자입니다.",
            )
    _validate_contract_window(
        values.get("contract_starts_at", organization.contract_starts_at),
        values.get("contract_ends_at", organization.contract_ends_at),
    )
    for field, value in values.items():
        setattr(organization, field, value)
    organization.updated_at = datetime.now(UTC)
    await record_audit(
        session,
        actor_user_id=context.user.id,
        action="organization.updated",
        entity_type="organization",
        entity_id=organization.id,
        organization_id=organization.id,
        details={"fields": sorted(values)},
    )
    await session.commit()
    return {"ok": True, "data": await _organization_data(session, organization)}


@router.put("/{organization_id}/artists")
async def set_organization_artists(
    organization_id: str,
    payload: OrganizationArtistsUpdate,
    context: CurrentAdmin,
    session: DbSession,
) -> dict:
    context.require_root()
    await _organization_or_404(session, organization_id)
    artist_ids = list(dict.fromkeys(payload.artist_ids))
    if artist_ids:
        found = set(
            (await session.scalars(select(Artist.id).where(Artist.id.in_(artist_ids)))).all()
        )
        if found != set(artist_ids):
            raise AppError(404, "RESOURCE_NOT_FOUND", "아티스트를 찾을 수 없습니다.")
    previous = await _organization_artist_ids(session, organization_id)
    removed = previous - set(artist_ids)
    member_ids = set(
        (
            await session.scalars(
                select(AdminMembership.user_id).where(
                    AdminMembership.organization_id == organization_id
                )
            )
        ).all()
    )
    if removed and member_ids:
        await session.execute(
            delete(AdminArtistAssignment).where(
                AdminArtistAssignment.admin_user_id.in_(member_ids),
                AdminArtistAssignment.artist_id.in_(removed),
            )
        )
    await session.execute(
        delete(OrganizationArtist).where(OrganizationArtist.organization_id == organization_id)
    )
    session.add_all(
        [
            OrganizationArtist(organization_id=organization_id, artist_id=artist_id)
            for artist_id in artist_ids
        ]
    )
    await record_audit(
        session,
        actor_user_id=context.user.id,
        action="organization.artists_updated",
        entity_type="organization",
        entity_id=organization_id,
        organization_id=organization_id,
        details={"artistIds": artist_ids, "removedArtistIds": sorted(removed)},
    )
    await session.commit()
    return {"ok": True, "data": {"artistIds": artist_ids}}


@router.get("/{organization_id}/members")
async def list_organization_members(
    organization_id: str,
    context: CurrentAdmin,
    session: DbSession,
) -> dict:
    context.require_root()
    await _organization_or_404(session, organization_id)
    rows = (
        await session.execute(
            select(User, AdminMembership)
            .join(AdminMembership, AdminMembership.user_id == User.id)
            .where(AdminMembership.organization_id == organization_id)
            .order_by(AdminMembership.status, AdminMembership.display_name)
        )
    ).all()
    return {
        "ok": True,
        "data": {
            "items": [await _member_data(session, user, membership) for user, membership in rows]
        },
    }


@router.post("/{organization_id}/members", status_code=status.HTTP_201_CREATED)
async def create_organization_member(
    organization_id: str,
    payload: OrganizationMemberCreate,
    context: CurrentAdmin,
    session: DbSession,
) -> dict:
    context.require_root()
    await _organization_or_404(session, organization_id)
    email = str(payload.email).lower()
    existing = await session.scalar(
        select(User).where(User.email == email, User.role == Role.ADMIN)
    )
    if existing:
        raise AppError(409, "EMAIL_TAKEN", "이미 등록된 관리자 이메일입니다.")
    artist_ids = await _validate_artist_subset(session, organization_id, payload.artist_ids)
    temporary_password = token_urlsafe(18)
    user = User(
        id=f"admin_{uuid4().hex[:12]}",
        email=email,
        nickname=payload.display_name,
        role=Role.ADMIN,
        password_hash=hash_password(temporary_password),
        must_change_password=True,
    )
    session.add(user)
    await session.flush()
    membership = AdminMembership(
        user_id=user.id,
        organization_id=organization_id,
        access_level=payload.access_level,
        status="active",
        display_name=payload.display_name,
        created_by_user_id=context.user.id,
    )
    session.add(membership)
    session.add_all(
        [
            AdminArtistAssignment(
                admin_user_id=user.id,
                artist_id=artist_id,
                assigned_by_user_id=context.user.id,
            )
            for artist_id in artist_ids
        ]
    )
    await record_audit(
        session,
        actor_user_id=context.user.id,
        action="organization.member_created",
        entity_type="admin_membership",
        entity_id=user.id,
        organization_id=organization_id,
        details={"accessLevel": payload.access_level, "artistIds": artist_ids},
    )
    await session.commit()
    data = await _member_data(session, user, membership)
    data["temporaryPassword"] = temporary_password
    return {"ok": True, "data": data}


async def _revoke_member_sessions(session: DbSession, user_id: str) -> None:
    changed_at = datetime.now(UTC)
    await session.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=changed_at)
    )
    await session.execute(delete(Session).where(Session.user_id == user_id))


@router.patch("/{organization_id}/members/{user_id}")
async def update_organization_member(
    organization_id: str,
    user_id: str,
    payload: OrganizationMemberUpdate,
    context: CurrentAdmin,
    session: DbSession,
) -> dict:
    context.require_root()
    await _organization_or_404(session, organization_id)
    user, membership = await _member_or_404(session, organization_id, user_id)
    values = payload.model_dump(exclude_unset=True, by_alias=False)
    security_changed = any(
        field in values and values[field] != getattr(membership, field)
        for field in ("access_level", "status")
    )
    for field, value in values.items():
        setattr(membership, field, value)
        if field == "display_name":
            user.nickname = value
    membership.updated_at = datetime.now(UTC)
    if security_changed:
        await _revoke_member_sessions(session, user.id)
    await record_audit(
        session,
        actor_user_id=context.user.id,
        action="organization.member_updated",
        entity_type="admin_membership",
        entity_id=user.id,
        organization_id=organization_id,
        details={"fields": sorted(values)},
    )
    await session.commit()
    return {"ok": True, "data": await _member_data(session, user, membership)}


@router.put("/{organization_id}/members/{user_id}/artists")
async def set_member_artists(
    organization_id: str,
    user_id: str,
    payload: OrganizationMemberArtistsUpdate,
    context: CurrentAdmin,
    session: DbSession,
) -> dict:
    context.require_root()
    await _organization_or_404(session, organization_id)
    user, membership = await _member_or_404(session, organization_id, user_id)
    artist_ids = await _validate_artist_subset(session, organization_id, payload.artist_ids)
    await session.execute(
        delete(AdminArtistAssignment).where(AdminArtistAssignment.admin_user_id == user.id)
    )
    session.add_all(
        [
            AdminArtistAssignment(
                admin_user_id=user.id,
                artist_id=artist_id,
                assigned_by_user_id=context.user.id,
            )
            for artist_id in artist_ids
        ]
    )
    membership.updated_at = datetime.now(UTC)
    await record_audit(
        session,
        actor_user_id=context.user.id,
        action="organization.member_artists_updated",
        entity_type="admin_membership",
        entity_id=user.id,
        organization_id=organization_id,
        details={"artistIds": artist_ids},
    )
    await session.commit()
    return {"ok": True, "data": await _member_data(session, user, membership)}
