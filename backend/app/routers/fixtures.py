from fastapi import APIRouter, status
from fastapi.responses import Response

from app.db.session import engine
from app.dependencies import DbSession
from app.models import Base
from app.services import reset_database, seed_core

router = APIRouter(prefix="/api/test", tags=["test-only"])


@router.post("/reset", status_code=status.HTTP_204_NO_CONTENT)
async def reset(session: DbSession) -> Response:
    # TestClient is intentionally created without `with`, so its lifespan isn't run.
    # The test-only router owns this setup rather than weakening production startup rules.
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
        await connection.run_sync(Base.metadata.create_all)
    await reset_database(session)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/seed", status_code=status.HTTP_201_CREATED)
async def seed(session: DbSession) -> dict:
    return {"ok": True, "data": await seed_core(session)}
