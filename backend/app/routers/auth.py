from fastapi import APIRouter, Response, status

from app.dependencies import FanUser
from app.schemas import MagicLinkRequest

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/magic-link/request", status_code=status.HTTP_202_ACCEPTED)
async def request_magic_link(payload: MagicLinkRequest) -> dict:
    # Provider integration is deliberately behind this stable HTTP contract.
    return {"ok": True, "data": {"delivery": "queued"}}


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(_: FanUser, response: Response) -> Response:
    response.delete_cookie("fanfolio_session")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
