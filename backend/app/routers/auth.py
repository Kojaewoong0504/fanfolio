from fastapi import APIRouter, Cookie, Header, Request, Response, status
from sqlalchemy import delete

from app.core.config import get_settings
from app.dependencies import CurrentUser, DbSession, session_cookie_name
from app.errors import AppError
from app.mailer import MailDeliveryError, deliver_magic_link
from app.models import Session
from app.rate_limit import enforce_rate_limit
from app.schemas import MagicLinkRequest, MagicLinkVerify
from app.services import request_magic_link as create_magic_link
from app.services import verify_magic_link

router = APIRouter(prefix="/api/auth", tags=["auth"])


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
    response.set_cookie(
        session_cookie_name(client),
        data.pop("sessionToken"),
        httponly=True,
        secure=get_settings().app_env == "production",
        samesite="lax",
        path="/",
    )
    return {"ok": True, "data": data}


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
) -> Response:
    scoped_token = {
        "fan": fanfolio_fan_session,
        "admin": fanfolio_admin_session,
        "artist": fanfolio_artist_session,
    }.get(client or "")
    token = scoped_token or fanfolio_session or session_header
    if token:
        await session.execute(delete(Session).where(Session.token == token))
    await session.commit()
    response.delete_cookie(session_cookie_name(client), path="/")
    if client is None:
        response.delete_cookie("fanfolio_session", path="/")
    response.status_code = status.HTTP_204_NO_CONTENT
    return response
