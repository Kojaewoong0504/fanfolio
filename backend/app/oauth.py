"""Provider-neutral OAuth 2.0/OIDC boundary for Kakao and Google."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from hmac import compare_digest
from secrets import token_urlsafe
from urllib.parse import urlencode
from uuid import uuid4

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth_tokens import issue_token_pair
from app.core.config import get_settings
from app.errors import AppError
from app.models import OAuthExchangeCode, OAuthState, Role, SocialAccount, User

SUPPORTED_OAUTH_PROVIDERS = frozenset({"google", "kakao"})


class OAuthError(AppError):
    def __init__(self, message: str = "소셜 로그인에 실패했습니다.") -> None:
        super().__init__(502, "SOCIAL_LOGIN_FAILED", message)


@dataclass(frozen=True)
class OAuthProfile:
    provider: str
    subject: str
    email: str | None
    nickname: str | None = None
    profile_image_url: str | None = None


def _now() -> datetime:
    return datetime.now(UTC)


def _as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value


def _hash(value: str) -> str:
    return sha256(value.encode("utf-8")).hexdigest()


def state_matches_cookie(raw_state: str, cookie_state: str | None) -> bool:
    return bool(cookie_state) and compare_digest(raw_state, cookie_state)


def _provider_config(provider: str) -> dict[str, str]:
    settings = get_settings()
    if provider == "google":
        return {
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "redirect_uri": settings.google_redirect_uri,
            "authorization_endpoint": "https://accounts.google.com/o/oauth2/v2/auth",
            "token_endpoint": "https://oauth2.googleapis.com/token",
            "userinfo_endpoint": "https://openidconnect.googleapis.com/v1/userinfo",
            "scope": "openid email profile",
        }
    if provider == "kakao":
        return {
            "client_id": settings.kakao_client_id,
            "client_secret": settings.kakao_client_secret,
            "redirect_uri": settings.kakao_redirect_uri,
            "authorization_endpoint": "https://kauth.kakao.com/oauth/authorize",
            "token_endpoint": "https://kauth.kakao.com/oauth/token",
            "userinfo_endpoint": "https://kapi.kakao.com/v2/user/me",
            # 이메일은 개인 개발자 앱에서 기본 제공되지 않으므로 선택 정보입니다.
            "scope": "profile_nickname profile_image",
        }
    raise AppError(404, "SOCIAL_PROVIDER_NOT_FOUND", "지원하지 않는 소셜 로그인입니다.")


def ensure_provider_configured(provider: str) -> dict[str, str]:
    config = _provider_config(provider)
    if not config["client_id"] or not config["client_secret"]:
        raise AppError(
            503, "SOCIAL_PROVIDER_NOT_CONFIGURED", "소셜 로그인 설정이 아직 완료되지 않았습니다."
        )
    return config


async def create_oauth_state(session: AsyncSession, provider: str, client: str) -> str:
    config = ensure_provider_configured(provider)
    raw_state = token_urlsafe(32)
    settings = get_settings()
    session.add(
        OAuthState(
            state_hash=_hash(raw_state),
            provider=provider,
            client=client,
            redirect_uri=config["redirect_uri"],
            expires_at=_now() + timedelta(seconds=settings.oauth_state_ttl_seconds),
        )
    )
    await session.commit()
    return raw_state


def authorization_url(provider: str, state: str) -> str:
    config = ensure_provider_configured(provider)
    params = {
        "client_id": config["client_id"],
        "redirect_uri": config["redirect_uri"],
        "response_type": "code",
        "scope": config["scope"],
        "state": state,
    }
    return f"{config['authorization_endpoint']}?{urlencode(params)}"


async def consume_oauth_state(session: AsyncSession, provider: str, raw_state: str) -> OAuthState:
    row = await session.scalar(
        select(OAuthState).where(OAuthState.state_hash == _hash(raw_state)).with_for_update()
    )
    if (
        row is None
        or row.provider != provider
        or row.consumed_at is not None
        or _as_utc(row.expires_at) <= _now()
    ):
        raise AppError(
            401, "SOCIAL_STATE_INVALID", "소셜 로그인 요청이 만료되었거나 유효하지 않습니다."
        )
    row.consumed_at = _now()
    return row


async def _provider_request(
    client: httpx.AsyncClient, method: str, url: str, **kwargs: object
) -> dict[str, object]:
    try:
        response = await client.request(method, url, **kwargs)
        response.raise_for_status()
        body = response.json()
    except (httpx.HTTPError, ValueError) as error:
        raise OAuthError() from error
    if not isinstance(body, dict):
        raise OAuthError()
    return body


async def fetch_oauth_profile(provider: str, code: str, redirect_uri: str) -> OAuthProfile:
    config = ensure_provider_configured(provider)
    token_payload = {
        "grant_type": "authorization_code",
        "client_id": config["client_id"],
        "client_secret": config["client_secret"],
        "redirect_uri": redirect_uri,
        "code": code,
    }
    async with httpx.AsyncClient(timeout=10.0) as client:
        token_data = await _provider_request(
            client,
            "POST",
            config["token_endpoint"],
            data=token_payload,
            headers={"Accept": "application/json"},
        )
        provider_access_token = token_data.get("access_token")
        if not isinstance(provider_access_token, str) or not provider_access_token:
            raise OAuthError()
        profile = await _provider_request(
            client,
            "GET",
            config["userinfo_endpoint"],
            headers={"Authorization": f"Bearer {provider_access_token}"},
        )

    profile_image_url = None
    if provider == "google":
        subject = profile.get("sub")
        email = profile.get("email")
        if profile.get("email_verified") is not True:
            raise AppError(
                422, "SOCIAL_EMAIL_REQUIRED", "이메일 인증이 완료된 계정만 사용할 수 있습니다."
            )
        if not isinstance(email, str) or not email:
            raise AppError(
                422, "SOCIAL_EMAIL_REQUIRED", "이메일 인증이 완료된 계정만 사용할 수 있습니다."
            )
        nickname = profile.get("name")
        profile_image_url = profile.get("picture")
    else:
        subject = profile.get("id")
        account = profile.get("kakao_account")
        account_data = account if isinstance(account, dict) else {}
        email = account_data.get("email")
        properties = profile.get("properties")
        property_data = properties if isinstance(properties, dict) else {}
        nickname = property_data.get("nickname")
        profile_image_url = property_data.get("profile_image")

    if not isinstance(subject, (str, int)):
        raise AppError(
            422, "SOCIAL_PROFILE_INCOMPLETE", "소셜 계정에서 필요한 정보를 가져오지 못했습니다."
        )
    normalized_email = email.lower() if isinstance(email, str) and email else None
    return OAuthProfile(
        provider,
        str(subject),
        normalized_email,
        nickname if isinstance(nickname, str) else None,
        profile_image_url if isinstance(profile_image_url, str) else None,
    )


async def upsert_social_user(session: AsyncSession, profile: OAuthProfile) -> User:
    account = await session.scalar(
        select(SocialAccount).where(
            SocialAccount.provider == profile.provider,
            SocialAccount.subject == profile.subject,
        )
    )
    if account:
        user = await session.get(User, account.user_id)
        if user is None:
            raise OAuthError("연결된 Fanfolio 계정을 찾을 수 없습니다.")
        if user.role != Role.FAN:
            user = None
            if profile.email:
                user = await session.scalar(
                    select(User).where(
                        User.email == profile.email,
                        User.role == Role.FAN,
                    )
                )
            if user is None:
                user = User(
                    id=f"user_{uuid4().hex}",
                    email=profile.email,
                    nickname=profile.nickname,
                    profile_image_url=profile.profile_image_url,
                    role=Role.FAN,
                )
                session.add(user)
                await session.flush()
            account.user_id = user.id
        if profile.nickname and user.nickname != profile.nickname:
            user.nickname = profile.nickname
        if profile.profile_image_url and user.profile_image_url != profile.profile_image_url:
            user.profile_image_url = profile.profile_image_url
        if profile.email and user.email is None:
            user.email = profile.email
        if profile.email:
            account.email = profile.email
        return user

    user = None
    if profile.email:
        user = await session.scalar(
            select(User).where(User.email == profile.email, User.role == Role.FAN)
        )
    if user is None:
        user = User(
            id=f"user_{uuid4().hex}",
            email=profile.email,
            nickname=profile.nickname,
            profile_image_url=profile.profile_image_url,
        )
        session.add(user)
        await session.flush()
    session.add(
        SocialAccount(
            id=f"social_{uuid4().hex}",
            provider=profile.provider,
            subject=profile.subject,
            user_id=user.id,
            email=profile.email,
        )
    )
    await session.flush()
    return user


async def create_exchange_code(session: AsyncSession, user: User, client: str) -> str:
    raw_code = token_urlsafe(32)
    settings = get_settings()
    session.add(
        OAuthExchangeCode(
            code_hash=_hash(raw_code),
            user_id=user.id,
            client=client,
            expires_at=_now() + timedelta(seconds=settings.oauth_exchange_code_ttl_seconds),
        )
    )
    await session.commit()
    return raw_code


async def exchange_code_for_tokens(
    session: AsyncSession, raw_code: str, client: str
) -> tuple[str, str, User]:
    row = await session.scalar(
        select(OAuthExchangeCode)
        .where(OAuthExchangeCode.code_hash == _hash(raw_code))
        .with_for_update()
    )
    if (
        row is None
        or row.client != client
        or row.consumed_at is not None
        or _as_utc(row.expires_at) <= _now()
    ):
        raise AppError(401, "SOCIAL_EXCHANGE_INVALID", "소셜 로그인 교환 코드가 유효하지 않습니다.")
    user = await session.get(User, row.user_id)
    if user is None:
        raise OAuthError("소셜 로그인 계정을 찾을 수 없습니다.")
    row.consumed_at = _now()
    access_token, refresh_token, _ = await issue_token_pair(session, user, client)
    return access_token, refresh_token, user
