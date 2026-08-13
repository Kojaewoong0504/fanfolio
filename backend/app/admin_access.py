from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import AppError
from app.models import (
    AdminArtistAssignment,
    AdminMembership,
    Organization,
    OrganizationArtist,
    User,
)

ROOT_ACTIONS = frozenset(
    {
        "organizations:manage",
        "members:manage",
        "artists:manage",
        "artists:read",
        "artists:write",
        "cards:read",
        "cards:write",
        "cards:review",
        "cards:publish",
        "drops:manage",
        "events:read",
        "events:write",
        "events:submit",
        "events:review",
        "events:publish",
        "codes:manage",
        "users:manage",
        "audit:read",
        "engagement:manage_global",
        "engagement:approve_global",
    }
)

PLATFORM_ACTIONS = frozenset(
    {
        "cards:read",
        "cards:review_platform",
        "notifications:read",
        "engagement:approve_global",
        "events:read",
        "events:review",
    }
)

PARTNER_ACTIONS = {
    "company_admin": frozenset(
        {
            "organization:read",
            "organization:manage_scoped",
            "members:manage_scoped",
            "artists:read",
            "artists:write",
            "cards:read",
            "cards:write",
            "cards:submit_review",
            "drops:read",
            "drops:write",
            "drops:submit",
            "events:read",
            "events:write",
            "events:submit",
            "codes:read",
            "codes:write",
            "engagement:write",
            "engagement:approve",
            "audit:read",
        }
    ),
    "manager": frozenset(
        {
            "artists:read",
            "artists:write",
            "cards:read",
            "cards:write",
            "cards:submit_review",
            "drops:read",
            "drops:write",
            "drops:submit",
            "events:read",
            "events:write",
            "events:submit",
            "codes:read",
            "codes:write",
            "engagement:write",
            "audit:read",
        }
    ),
    "editor": frozenset(
        {
            "artists:read",
            "artists:write",
            "cards:read",
            "cards:write",
            "cards:submit_review",
            "drops:read",
            "events:read",
            "events:write",
            "drops:write",
            "codes:read",
            "engagement:write",
            "audit:read",
        }
    ),
    "viewer": frozenset(
        {"artists:read", "cards:read", "drops:read", "events:read", "codes:read", "audit:read"}
    ),
}
PARTNER_SCOPED_ACTIONS = frozenset().union(*PARTNER_ACTIONS.values(), PLATFORM_ACTIONS)


@dataclass(frozen=True, slots=True)
class AdminContext:
    user: User
    membership: AdminMembership
    organization: Organization | None
    assigned_artist_ids: frozenset[str]
    allowed_actions: frozenset[str]

    @property
    def is_root(self) -> bool:
        return self.membership.access_level == "root"

    @property
    def is_platform_operator(self) -> bool:
        return self.membership.access_level == "platform_operator"

    def require_root(self) -> None:
        if not self.is_root:
            raise AppError(
                403,
                "ADMIN_ROOT_REQUIRED",
                "루트 관리자 권한이 필요한 작업입니다.",
            )

    def require_write(self) -> None:
        if "cards:write" not in self.allowed_actions:
            raise AppError(
                403,
                "ADMIN_WRITE_REQUIRED",
                "편집 권한이 필요한 작업입니다.",
            )

    def require_action(self, action: str) -> None:
        if action not in self.allowed_actions:
            code = (
                "ADMIN_ROOT_REQUIRED"
                if action not in PARTNER_SCOPED_ACTIONS
                else "ADMIN_WRITE_REQUIRED"
            )
            raise AppError(403, code, "이 작업을 수행할 권한이 없습니다.")

    def require_artist(self, artist_id: str | None) -> str:
        if not artist_id:
            if self.is_root:
                return ""
            raise AppError(422, "ARTIST_REQUIRED", "아티스트를 선택해 주세요.")
        if not self.is_root and artist_id not in self.assigned_artist_ids:
            raise AppError(404, "RESOURCE_NOT_FOUND", "항목을 찾을 수 없습니다.")
        return artist_id


async def load_admin_context(session: AsyncSession, user: User) -> AdminContext:
    membership = await session.get(AdminMembership, user.id)
    if membership is None:
        raise AppError(
            403,
            "ADMIN_MEMBERSHIP_REQUIRED",
            "활성 관리자 권한이 등록되어 있지 않습니다.",
        )
    if membership.status != "active":
        raise AppError(403, "ADMIN_ACCESS_SUSPENDED", "중지된 관리자 계정입니다.")

    organization = None
    assigned_artist_ids: frozenset[str] = frozenset()
    if membership.access_level == "platform_operator":
        if membership.organization_id is not None:
            raise AppError(403, "ADMIN_MEMBERSHIP_INVALID", "관리자 권한 구성이 올바르지 않습니다.")
    elif membership.access_level != "root":
        if membership.organization_id is None:
            raise AppError(403, "ADMIN_MEMBERSHIP_INVALID", "관리자 권한 구성이 올바르지 않습니다.")
        organization = await session.get(Organization, membership.organization_id)
        if organization is None or organization.status != "active":
            raise AppError(403, "ADMIN_ACCESS_SUSPENDED", "중지된 파트너 조직입니다.")
        artist_scope = (
            select(OrganizationArtist.artist_id).where(
                OrganizationArtist.organization_id == membership.organization_id
            )
            if membership.access_level == "company_admin"
            else select(AdminArtistAssignment.artist_id).where(
                AdminArtistAssignment.admin_user_id == user.id
            )
        )
        assignments = await session.scalars(artist_scope)
        assigned_artist_ids = frozenset(assignments.all())

    allowed_actions = (
        ROOT_ACTIONS
        if membership.access_level == "root"
        else PLATFORM_ACTIONS
        if membership.access_level == "platform_operator"
        else PARTNER_ACTIONS.get(membership.access_level, frozenset())
    )
    return AdminContext(
        user=user,
        membership=membership,
        organization=organization,
        assigned_artist_ids=assigned_artist_ids,
        allowed_actions=allowed_actions,
    )
