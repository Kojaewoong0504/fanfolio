"""Application composition: routes are deliberately kept out of this module."""

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.core.config import get_settings
from app.db.session import engine
from app.errors import AppError
from app.models import Base
from app.routers import admin, artist, auth, fan, health, test_support


@asynccontextmanager
async def lifespan(_: FastAPI):
    # `lifespan` replaces the older startup/shutdown event decorators.
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


def create_app() -> FastAPI:
    app = FastAPI(title="Fanfolio API", version="0.2.0", lifespan=lifespan)

    @app.exception_handler(AppError)
    async def app_error(_: Request, error: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=error.status_code,
            content={"ok": False, "error": {"code": error.code, "message": error.message}},
        )

    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(fan.router)
    app.include_router(admin.router)
    app.include_router(artist.router)
    if get_settings().app_env == "test":
        app.include_router(test_support.router)
    return app


app = create_app()
