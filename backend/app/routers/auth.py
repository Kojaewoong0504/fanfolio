from fastapi import APIRouter, Response, status

from app.dependencies import DbSession, FanUser
from app.schemas import MagicLinkRequest, MagicLinkVerify
from app.services import request_magic_link as create_magic_link
from app.services import verify_magic_link

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/magic-link/request", status_code=status.HTTP_202_ACCEPTED)
async def request_magic_link(payload: MagicLinkRequest, session: DbSession) -> dict:
    # The mail provider receives this token in a later integration step.
    await create_magic_link(session, email=str(payload.email), purpose=payload.purpose)
    return {"ok": True, "data": {"delivery": "queued"}}


@router.post("/magic-link/verify")
async def verify_magic_link_endpoint(
    payload: MagicLinkVerify, response: Response, session: DbSession
) -> dict:
    data = await verify_magic_link(session, token=payload.token)
    response.set_cookie("fanfolio_session", data.pop("sessionToken"), httponly=True, samesite="lax")
    return {"ok": True, "data": data}


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(_: FanUser, response: Response) -> Response:
    response.delete_cookie("fanfolio_session")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
