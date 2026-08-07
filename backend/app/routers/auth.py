from fastapi import APIRouter, Cookie, Header, Query, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy import delete

from app.auth_tokens import (
    AuthTokenError,
    decode_refresh_token,
    issue_token_pair,
    revoke_refresh_family,
    rotate_refresh_token,
)
from app.core.config import get_settings
from app.dependencies import CurrentUser, DbSession, refresh_cookie_name, session_cookie_name
from app.errors import AppError
from app.mailer import MailDeliveryError, deliver_magic_link
from app.models import RefreshToken, Session, User
from app.oauth import (
    authorization_url,
    consume_oauth_state,
    create_exchange_code,
    create_oauth_state,
    exchange_code_for_tokens,
    fetch_oauth_profile,
    state_matches_cookie,
    upsert_social_user,
)
from app.rate_limit import enforce_rate_limit
from app.schemas import MagicLinkRequest, MagicLinkVerify, OAuthExchangeRequest
from app.services import request_magic_link as create_magic_link
from app.services import verify_magic_link

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _refresh_cookie_samesite() -> str:
    """Allow the deployed Vercel fan app to refresh against the Render API."""
    return "none" if get_settings().app_env == "production" else "lax"


def _oauth_frontend_url(error: str | None = None, code: str | None = None) -> str:
    base = get_settings().oauth_frontend_callback_url
    params = {key: value for key, value in {"error": error, "code": code}.items() if value}
    if not params:
        return base
    separator = "&" if "?" in base else "?"
    from urllib.parse import urlencode

    return f"{base}{separator}{urlencode(params)}"


@router.get("/oauth/{provider}/start")
async def oauth_start(
    provider: str,
    session: DbSession,
    client: str = Query(default="fan"),
) -> RedirectResponse:
    if client != "fan":
        raise AppError(
            403, "SOCIAL_CLIENT_NOT_ALLOWED", "소셜 로그인은 팬 앱에서만 사용할 수 있습니다."
        )
    state = await create_oauth_state(session, provider, client)
    redirect = RedirectResponse(
        authorization_url(provider, state), status_code=status.HTTP_302_FOUND
    )
    redirect.set_cookie(
        "fanfolio_oauth_state",
        state,
        httponly=True,
        secure=get_settings().app_env == "production",
        samesite="lax",
        path="/api/auth/oauth",
        max_age=get_settings().oauth_state_ttl_seconds,
    )
    return redirect


@router.get("/oauth/{provider}/callback")
async def oauth_callback(
    provider: str,
    session: DbSession,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    oauth_state_cookie: str | None = Cookie(default=None, alias="fanfolio_oauth_state"),
) -> RedirectResponse:
    if error or not code or not state:
        redirect = RedirectResponse(
            _oauth_frontend_url(error or "SOCIAL_LOGIN_CANCELLED"),
            status_code=status.HTTP_302_FOUND,
        )
        redirect.delete_cookie("fanfolio_oauth_state", path="/api/auth/oauth")
        return redirect
    if not state_matches_cookie(state, oauth_state_cookie):
        redirect = RedirectResponse(
            _oauth_frontend_url("SOCIAL_STATE_INVALID"), status_code=status.HTTP_302_FOUND
        )
        redirect.delete_cookie("fanfolio_oauth_state", path="/api/auth/oauth")
        return redirect
    try:
        state_row = await consume_oauth_state(session, provider, state)
        profile = await fetch_oauth_profile(provider, code, state_row.redirect_uri)
        user = await upsert_social_user(session, profile)
        exchange_code = await create_exchange_code(session, user, state_row.client)
    except AppError as oauth_error:
        await session.rollback()
        redirect = RedirectResponse(
            _oauth_frontend_url(oauth_error.code), status_code=status.HTTP_302_FOUND
        )
        redirect.delete_cookie("fanfolio_oauth_state", path="/api/auth/oauth")
        return redirect
    redirect = RedirectResponse(
        _oauth_frontend_url(code=exchange_code), status_code=status.HTTP_302_FOUND
    )
    redirect.delete_cookie("fanfolio_oauth_state", path="/api/auth/oauth")
    return redirect


@router.post("/oauth/exchange")
async def oauth_exchange(
    payload: OAuthExchangeRequest,
    response: Response,
    session: DbSession,
) -> dict:
    access_token, refresh_token, user = await exchange_code_for_tokens(
        session, payload.code, payload.client
    )
    await session.commit()
    settings = get_settings()
    response.set_cookie(
        refresh_cookie_name(payload.client),
        refresh_token,
        httponly=True,
        secure=settings.app_env == "production",
        samesite=_refresh_cookie_samesite(),
        path="/",
        max_age=settings.jwt_refresh_ttl_seconds,
    )
    return {
        "ok": True,
        "data": {
            "accessToken": access_token,
            "userId": user.id,
            "onboardingCompleted": user.onboarding_completed,
        },
    }


@router.post("/magic-link/request", status_code=status.HTTP_202_ACCEPTED)
async def request_magic_link(
    payload: MagicLinkRequest, request: Request, session: DbSession
) -> dict:
    email = str(payload.email).lower()
    client_host = request.client.host if request.client else "unknown"
    await enforce_rate_limit(f"magic-link:{email}:{client_host}", limit=5, window_seconds=15 * 60)
    token = await create_magic_link(session, email=email, purpose=payload.purpose)
    try:
        await deliver_magic_link(email, token, payload.purpose)
    except MailDeliveryError as error:
        raise AppError(
            503,
            "MAGIC_LINK_DELIVERY_FAILED",
            "로그인 링크를 보내지 못했습니다. 잠시 후 다시 시도해 주세요.",
        ) from error
    return {"ok": True, "data": {"delivery": "queued"}}


@router.post("/magic-link/verify")
async def verify_magic_link_endpoint(
    payload: MagicLinkVerify,
    response: Response,
    session: DbSession,
    client: str | None = Header(default=None, alias="X-Fanfolio-Client"),
) -> dict:
    data = await verify_magic_link(session, token=payload.token)
    client_name = client or "fan"
    user = await session.get(User, data["userId"])
    if user is None:
        raise AppError(401, "AUTH_REQUIRED", "로그인 계정을 찾을 수 없습니다.")
    access_token, refresh_token, _ = await issue_token_pair(session, user, client_name)
    await session.commit()
    response.set_cookie(
        refresh_cookie_name(client_name),
        refresh_token,
        httponly=True,
        secure=get_settings().app_env == "production",
        samesite=_refresh_cookie_samesite(),
        path="/",
        max_age=get_settings().jwt_refresh_ttl_seconds,
    )
    if get_settings().app_env != "production":
        response.set_cookie(
            session_cookie_name(client),
            data.pop("sessionToken"),
            httponly=True,
            secure=False,
            samesite="lax",
            path="/",
        )
    data.pop("userId", None)
    data["accessToken"] = access_token
    return {"ok": True, "data": data}


@router.post("/refresh")
async def refresh_access_token(
    response: Response,
    session: DbSession,
    client: str | None = Header(default=None, alias="X-Fanfolio-Client"),
    fanfolio_refresh: str | None = Cookie(default=None),
    fanfolio_fan_refresh: str | None = Cookie(default=None),
    fanfolio_admin_refresh: str | None = Cookie(default=None),
    fanfolio_artist_refresh: str | None = Cookie(default=None),
) -> dict:
    client_name = client or "fan"
    raw_token = {
        "fan": fanfolio_fan_refresh,
        "admin": fanfolio_admin_refresh,
        "artist": fanfolio_artist_refresh,
    }.get(client_name) or fanfolio_refresh
    if not raw_token:
        raise AppError(401, "AUTH_REQUIRED", "로그인이 필요합니다.")
    access_token, refresh_token, _ = await rotate_refresh_token(session, raw_token, client_name)
    await session.commit()
    response.set_cookie(
        refresh_cookie_name(client_name),
        refresh_token,
        httponly=True,
        secure=get_settings().app_env == "production",
        samesite=_refresh_cookie_samesite(),
        path="/",
        max_age=get_settings().jwt_refresh_ttl_seconds,
    )
    return {"ok": True, "data": {"accessToken": access_token}}


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    _: CurrentUser,
    session: DbSession,
    response: Response,
    fanfolio_session: str | None = Cookie(default=None),
    fanfolio_fan_session: str | None = Cookie(default=None),
    fanfolio_admin_session: str | None = Cookie(default=None),
    fanfolio_artist_session: str | None = Cookie(default=None),
    client: str | None = Header(default=None, alias="X-Fanfolio-Client"),
    session_header: str | None = Header(default=None, alias="X-Fanfolio-Session"),
    fanfolio_refresh: str | None = Cookie(default=None),
    fanfolio_fan_refresh: str | None = Cookie(default=None),
    fanfolio_admin_refresh: str | None = Cookie(default=None),
    fanfolio_artist_refresh: str | None = Cookie(default=None),
) -> Response:
    scoped_token = {
        "fan": fanfolio_fan_session,
        "admin": fanfolio_admin_session,
        "artist": fanfolio_artist_session,
    }.get(client or "")
    token = scoped_token or fanfolio_session or session_header
    if token:
        await session.execute(delete(Session).where(Session.token == token))
    refresh_token = {
        "fan": fanfolio_fan_refresh,
        "admin": fanfolio_admin_refresh,
        "artist": fanfolio_artist_refresh,
    }.get(client or "") or fanfolio_refresh
    if refresh_token:
        try:
            claims = decode_refresh_token(refresh_token, expected_client=client or "fan")
            row = await session.get(RefreshToken, str(claims["jti"]))
            if row:
                await revoke_refresh_family(session, row.family_id)
        except AuthTokenError:
            pass
    await session.commit()
    response.delete_cookie(session_cookie_name(client), path="/")
    response.delete_cookie(refresh_cookie_name(client), path="/")
    if client is None:
        response.delete_cookie("fanfolio_session", path="/")
    response.status_code = status.HTTP_204_NO_CONTENT
    return response
