"""Application composition: routes are deliberately kept out of this module."""

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.core.config import get_settings
from app.db.session import SessionLocal, engine
from app.errors import AppError
from app.models import Base
from app.routers import (
    admin,
    artist,
    assets,
    auth,
    combinations,
    events,
    fan,
    fixtures,
    health,
    social,
)
from app.services import (
    ensure_admin_bootstrap,
    ensure_data_identity,
    ensure_demo_card_asset,
    ensure_demo_catalog,
    repair_demo_catalog_asset_urls,
)

logger = logging.getLogger(__name__)


async def _repair_demo_card_assets_if_enabled(settings: object) -> None:
    """Run the optional demo repair without making it a startup dependency.

    Demo assets are convenience data, while the API process is a production
    dependency. A transient object-storage permission or bucket error must be
    reported and deferred rather than preventing the health endpoint from
    coming up.
    """
    # Hosted environments must self-heal the controlled QA cards after a
    # Render restart.  The repair is intentionally restricted to the stable
    # demo/QA IDs inside ``ensure_demo_card_asset``; partner-owned cards are
    # never discovered or rewritten here.  Local development keeps the
    # opt-in flag so a developer does not get unexpected storage writes.
    if not settings.repair_demo_card_assets and settings.app_env not in {"staging", "production"}:
        return
    try:
        async with SessionLocal() as session:
            await ensure_demo_card_asset(session)
    except Exception:
        logger.exception("Demo card asset repair was skipped; the API will continue starting")


@asynccontextmanager
async def lifespan(_: FastAPI):
    # `lifespan` replaces the older startup/shutdown event decorators.
    settings = get_settings()
    logger.info(
        "Fanfolio API starting: app_env=%s database_backend=%s storage_backend=%s",
        settings.app_env,
        settings.database_backend,
        settings.storage_backend,
    )
    if settings.auto_create_schema:
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
    if settings.seed_demo_catalog:
        async with SessionLocal() as session:
            await ensure_demo_catalog(session)
    await _repair_demo_card_assets_if_enabled(settings)

    async with SessionLocal() as session:
        await ensure_data_identity(session)
        await ensure_admin_bootstrap(session)
        await repair_demo_catalog_asset_urls(session)
    yield
    await engine.dispose()


def create_app() -> FastAPI:
    settings = get_settings()
    settings.validate_runtime()
    app = FastAPI(title="Fanfolio API", version="0.2.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_origin_regex=settings.allowed_origin_regex,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Demo catalog records use API-relative asset URLs so the same catalog can
    # render in local, preview, and hosted frontends. Serve the bundled demo
    # files from the API container instead of leaving those URLs as 404s.
    assets_root = Path(__file__).resolve().parents[1] / "assets"
    if assets_root.is_dir():
        app.mount("/assets", StaticFiles(directory=assets_root), name="static-assets")

    @app.middleware("http")
    async def security_middleware(request: Request, call_next):
        # Cookie-authenticated state changes must originate from one of our
        # configured frontends. CORS protects JavaScript callers, but an
        # Origin check also covers cross-site form submissions.
        if get_settings().is_hosted and request.method in {
            "POST",
            "PUT",
            "PATCH",
            "DELETE",
        }:
            request_settings = get_settings()
            origin = request.headers.get("origin")
            if origin and not request_settings.is_origin_allowed(origin):
                return JSONResponse(
                    status_code=403,
                    content={
                        "ok": False,
                        "error": {
                            "code": "CSRF_ORIGIN_INVALID",
                            "message": "허용되지 않은 요청 출처입니다.",
                        },
                    },
                )

        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        return response

    @app.exception_handler(AppError)
    async def app_error(_: Request, error: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=error.status_code,
            content={"ok": False, "error": {"code": error.code, "message": error.message}},
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, error: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content={
                "ok": False,
                "error": {"code": "VALIDATION_ERROR", "message": "입력값을 확인해 주세요."},
            },
        )

    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(fan.router)
    app.include_router(social.router)
    app.include_router(combinations.router)
    app.include_router(admin.router)
    app.include_router(artist.router)
    app.include_router(assets.router)
    app.include_router(events.router)
    app.include_router(events.admin_router)
    if get_settings().app_env == "test":
        app.include_router(fixtures.router)
    return app


app = create_app()
