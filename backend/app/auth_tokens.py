"""JWT access tokens and database-backed refresh-token rotation.

The access token is intentionally self-contained and short-lived. Refresh
tokens are signed JWTs too, but their jti and digest are persisted so a replay
can revoke the complete rotation family instead of silently issuing another
session.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from hashlib import sha256
from uuid import uuid4

import jwt
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.errors import AppError
from app.models import RefreshToken, Role, User

JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_TYPE = "access"
REFRESH_TOKEN_TYPE = "refresh"
SUPPORTED_CLIENTS = frozenset({"fan", "admin", "artist"})


class AuthTokenError(AppError):
    def __init__(self, message: str = "인증 토큰이 유효하지 않습니다.") -> None:
        super().__init__(401, "AUTH_TOKEN_INVALID", message)


def _now() -> datetime:
    return datetime.now(UTC)


def _as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value


def _validate_client(client: str) -> None:
    if client not in SUPPORTED_CLIENTS:
        raise AuthTokenError("인증 대상이 유효하지 않습니다.")


def _encode(payload: dict[str, object], *, secret: str) -> str:
    return jwt.encode(payload, secret, algorithm=JWT_ALGORITHM)


def _decode(
    raw_token: str, *, secret: str, expected_type: str, expected_client: str
) -> dict[str, object]:
    settings = get_settings()
    _validate_client(expected_client)
    try:
        payload = jwt.decode(
            raw_token,
            secret,
            algorithms=[JWT_ALGORITHM],
            audience=settings.jwt_audience,
            issuer=settings.jwt_issuer,
            options={
                "require": ["sub", "role", "client", "typ", "iss", "aud", "iat", "exp", "jti"]
            },
        )
    except jwt.InvalidTokenError as error:
        raise AuthTokenError() from error
    if payload.get("typ") != expected_type or payload.get("client") != expected_client:
        raise AuthTokenError()
    return payload


def issue_access_token(user: User, client: str) -> str:
    """Create a short-lived access JWT for one app/client boundary."""
    settings = get_settings()
    _validate_client(client)
    now = _now()
    payload: dict[str, object] = {
        "sub": user.id,
        "role": user.role.value if isinstance(user.role, Role) else str(user.role),
        "client": client,
        "typ": ACCESS_TOKEN_TYPE,
        "iss": settings.jwt_issuer,
        "aud": settings.jwt_audience,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=settings.jwt_access_ttl_seconds)).timestamp()),
        "jti": uuid4().hex,
    }
    return _encode(payload, secret=settings.jwt_access_secret)


def decode_access_token(raw_token: str, expected_client: str) -> dict[str, object]:
    return _decode(
        raw_token,
        secret=get_settings().jwt_access_secret,
        expected_type=ACCESS_TOKEN_TYPE,
        expected_client=expected_client,
    )


def decode_refresh_token(raw_token: str, expected_client: str) -> dict[str, object]:
    return _decode(
        raw_token,
        secret=get_settings().jwt_refresh_secret,
        expected_type=REFRESH_TOKEN_TYPE,
        expected_client=expected_client,
    )


def _refresh_digest(raw_token: str) -> str:
    return sha256(raw_token.encode("utf-8")).hexdigest()


async def issue_refresh_token(
    session: AsyncSession,
    user: User,
    client: str,
    *,
    family_id: str | None = None,
) -> tuple[str, RefreshToken]:
    """Create and persist one refresh token; only the raw value leaves memory."""
    settings = get_settings()
    _validate_client(client)
    now = _now()
    jti = uuid4().hex
    expires_at = now + timedelta(seconds=settings.jwt_refresh_ttl_seconds)
    raw_token = _encode(
        {
            "sub": user.id,
            "role": user.role.value if isinstance(user.role, Role) else str(user.role),
            "client": client,
            "typ": REFRESH_TOKEN_TYPE,
            "iss": settings.jwt_issuer,
            "aud": settings.jwt_audience,
            "iat": int(now.timestamp()),
            "exp": int(expires_at.timestamp()),
            "jti": jti,
        },
        secret=settings.jwt_refresh_secret,
    )
    row = RefreshToken(
        jti=jti,
        family_id=family_id or uuid4().hex,
        token_digest=_refresh_digest(raw_token),
        user_id=user.id,
        client=client,
        expires_at=expires_at,
    )
    session.add(row)
    await session.flush()
    return raw_token, row


async def issue_token_pair(
    session: AsyncSession,
    user: User,
    client: str,
) -> tuple[str, str, RefreshToken]:
    access_token = issue_access_token(user, client)
    refresh_token, row = await issue_refresh_token(session, user, client)
    return access_token, refresh_token, row


async def revoke_refresh_family(session: AsyncSession, family_id: str) -> None:
    await session.execute(
        update(RefreshToken)
        .where(RefreshToken.family_id == family_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=_now())
    )


async def rotate_refresh_token(
    session: AsyncSession,
    raw_token: str,
    expected_client: str,
) -> tuple[str, str, RefreshToken]:
    """Atomically consume a refresh token and issue its replacement."""
    settings = get_settings()
    payload = _decode(
        raw_token,
        secret=settings.jwt_refresh_secret,
        expected_type=REFRESH_TOKEN_TYPE,
        expected_client=expected_client,
    )
    jti = str(payload["jti"])
    row = await session.scalar(
        select(RefreshToken).where(RefreshToken.jti == jti).with_for_update()
    )
    if row is None or row.token_digest != _refresh_digest(raw_token):
        raise AuthTokenError()
    if row.used_at is not None or row.replaced_by_jti is not None:
        await revoke_refresh_family(session, row.family_id)
        await session.commit()
        raise AuthTokenError("재사용된 인증 토큰입니다. 다시 로그인해 주세요.")
    if row.revoked_at is not None or _as_utc(row.expires_at) <= _now():
        raise AuthTokenError("만료되었거나 폐기된 인증 토큰입니다.")
    if row.user_id != str(payload["sub"]) or row.client != expected_client:
        raise AuthTokenError()

    user = await session.get(User, row.user_id)
    if user is None or user.role.value != str(payload["role"]):
        raise AuthTokenError()
    row.used_at = _now()
    access_token = issue_access_token(user, expected_client)
    new_refresh, replacement = await issue_refresh_token(
        session,
        user,
        expected_client,
        family_id=row.family_id,
    )
    row.replaced_by_jti = replacement.jti
    return access_token, new_refresh, replacement
