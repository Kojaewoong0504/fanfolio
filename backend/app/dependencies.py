from typing import Annotated

from fastapi import Cookie, Depends, Header, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth_tokens import AuthTokenError, decode_access_token
from app.core.config import get_settings
from app.db.session import get_session
from app.errors import AppError
from app.models import Role, Session, User

DbSession = Annotated[AsyncSession, Depends(get_session)]

SESSION_COOKIE_BY_CLIENT = {
    "fan": "fanfolio_fan_session",
    "admin": "fanfolio_admin_session",
    "artist": "fanfolio_artist_session",
}

REFRESH_COOKIE_BY_CLIENT = {
    "fan": "fanfolio_fan_refresh",
    "admin": "fanfolio_admin_refresh",
    "artist": "fanfolio_artist_refresh",
}


def session_cookie_name(client: str | None) -> str:
    """Keep browser sessions isolated when the local apps share one host."""
    return SESSION_COOKIE_BY_CLIENT.get(client or "", "fanfolio_session")


def refresh_cookie_name(client: str | None) -> str:
    """Keep refresh-token cookies isolated between the three local apps."""
    return REFRESH_COOKIE_BY_CLIENT.get(client or "", "fanfolio_refresh")


async def current_user(
    session: DbSession,
    fanfolio_session: str | None = Cookie(default=None),
    fanfolio_fan_session: str | None = Cookie(default=None),
    fanfolio_admin_session: str | None = Cookie(default=None),
    fanfolio_artist_session: str | None = Cookie(default=None),
    client_header: str | None = Header(default=None, alias="X-Fanfolio-Client"),
    client_query: str | None = Query(default=None, alias="client"),
    session_header: str | None = Header(default=None, alias="X-Fanfolio-Session"),
    authorization: str | None = Header(default=None),
) -> User:
    client = client_header or client_query
    if authorization:
        scheme, _, raw_token = authorization.partition(" ")
        if scheme.lower() != "bearer" or not raw_token:
            raise AuthTokenError()
        claims = decode_access_token(raw_token, expected_client=client or "")
        user = await session.get(User, str(claims["sub"]))
        if not user or user.role.value != claims.get("role"):
            raise AuthTokenError()
        return user
    if get_settings().is_hosted:
        raise AppError(401, "AUTH_REQUIRED", "로그인이 필요합니다.")
    scoped_token = {
        "fan": fanfolio_fan_session,
        "admin": fanfolio_admin_session,
        "artist": fanfolio_artist_session,
    }.get(client or "")
    token = scoped_token or fanfolio_session or session_header
    if not token:
        raise AppError(401, "AUTH_REQUIRED", "로그인이 필요합니다.")
    user = await session.scalar(
        select(User).join(Session, Session.user_id == User.id).where(Session.token == token)
    )
    if not user:
        raise AppError(401, "AUTH_REQUIRED", "유효하지 않은 세션입니다.")
    return user


async def require(role: Role, user: Annotated[User, Depends(current_user)]) -> User:
    if user.role != role:
        raise AppError(403, "FORBIDDEN", "권한이 없습니다.")
    return user


async def fan_user(user: Annotated[User, Depends(current_user)]) -> User:
    return await require(Role.FAN, user)


async def admin_user(user: Annotated[User, Depends(current_user)]) -> User:
    return await require(Role.ADMIN, user)


async def artist_user(user: Annotated[User, Depends(current_user)]) -> User:
    return await require(Role.ARTIST, user)


FanUser = Annotated[User, Depends(fan_user)]
AdminUser = Annotated[User, Depends(admin_user)]
ArtistUser = Annotated[User, Depends(artist_user)]
CurrentUser = Annotated[User, Depends(current_user)]


async def optional_current_user(
    session: DbSession,
    fanfolio_session: str | None = Cookie(default=None),
    fanfolio_fan_session: str | None = Cookie(default=None),
    fanfolio_admin_session: str | None = Cookie(default=None),
    fanfolio_artist_session: str | None = Cookie(default=None),
    client_header: str | None = Header(default=None, alias="X-Fanfolio-Client"),
    client_query: str | None = Query(default=None, alias="client"),
    session_header: str | None = Header(default=None, alias="X-Fanfolio-Session"),
    authorization: str | None = Header(default=None),
) -> User | None:
    """Resolve a session when present, without rejecting signed-link requests."""
    client = client_header or client_query
    if authorization:
        scheme, _, raw_token = authorization.partition(" ")
        if scheme.lower() != "bearer" or not raw_token:
            return None
        try:
            claims = decode_access_token(raw_token, expected_client=client or "")
        except AuthTokenError:
            return None
        user = await session.get(User, str(claims["sub"]))
        return user if user and user.role.value == claims.get("role") else None
    if get_settings().is_hosted:
        return None
    scoped_token = {
        "fan": fanfolio_fan_session,
        "admin": fanfolio_admin_session,
        "artist": fanfolio_artist_session,
    }.get(client or "")
    token = scoped_token or fanfolio_session or session_header
    if not token:
        return None
    return await session.scalar(
        select(User).join(Session, Session.user_id == User.id).where(Session.token == token)
    )


OptionalCurrentUser = Annotated[User | None, Depends(optional_current_user)]
