from __future__ import annotations

import asyncio
import os
import tempfile
from importlib import import_module
from pathlib import Path
from typing import Any

# VSCode's test runner may not forward python.testing.env consistently.
# The fixture API is test-only, so the test process must opt into it before
# importing app.main (which decides whether to register that router).
os.environ.setdefault("APP_ENV", "test")
if "DATABASE_URL" not in os.environ:
    test_database_path = Path(tempfile.gettempdir()) / f"fanfolio-pytest-{os.getpid()}.db"
    os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{test_database_path}"

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


@pytest.fixture(scope="session")
def app() -> FastAPI:
    """백엔드가 제공해야 하는 FastAPI 앱 계약: app.main:app."""
    try:
        module = import_module("app.main")
    except ModuleNotFoundError:
        pytest.fail(
            "FastAPI 앱을 찾을 수 없습니다. backend/app/main.py에 `app = FastAPI()`를 만드세요.",
            pytrace=False,
        )

    fastapi_app = getattr(module, "app", None)
    if not isinstance(fastapi_app, FastAPI):
        pytest.fail("app.main은 FastAPI 인스턴스인 `app`을 export해야 합니다.", pytrace=False)
    return fastapi_app


@pytest.fixture
def client(app: FastAPI) -> TestClient:
    return TestClient(app)


@pytest.fixture
def seeded(client: TestClient) -> dict[str, Any]:
    """테스트 전용 fixture API로 매 테스트를 독립된 상태에서 시작한다."""
    reset = client.post("/api/test/reset")
    assert reset.status_code == 204, reset.text

    response = client.post("/api/test/seed", json={"scenario": "core"})
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["ok"] is True
    return body["data"]


@pytest.fixture
def actors(app: FastAPI, seeded: dict[str, Any]) -> dict[str, TestClient]:
    """seed 응답의 세션 값으로 Fan/Admin/Artist 인증 클라이언트를 준비한다."""
    result: dict[str, TestClient] = {}
    for role, session in seeded["sessions"].items():
        actor = TestClient(app)
        actor.cookies.set("fanfolio_session", session)
        result[role] = actor
    return result


@pytest.fixture
def seeded_roles(app: FastAPI, actors: dict[str, TestClient]) -> dict[str, TestClient]:
    """기준 출시 시나리오에서 사용하는 역할별 인증 클라이언트를 고정한다."""
    from app.db.session import SessionLocal
    from app.models import (
        AdminArtistAssignment,
        AdminMembership,
        Organization,
        OrganizationArtist,
        Role,
        Session,
        User,
    )

    async def add_partner_users() -> None:
        async with SessionLocal() as session:
            if await session.get(Organization, "org_scenario_partner") is None:
                session.add(
                    Organization(
                        id="org_scenario_partner",
                        name="시나리오 파트너사",
                        slug="scenario-partner",
                        status="active",
                    )
                )
            if (
                await session.get(OrganizationArtist, ("org_scenario_partner", "artist_nova3"))
                is None
            ):
                session.add(
                    OrganizationArtist(
                        organization_id="org_scenario_partner", artist_id="artist_nova3"
                    )
                )
            for user_id, access_level in (
                ("scenario_partner_manager", "manager"),
                ("scenario_partner_editor", "editor"),
            ):
                if await session.get(User, user_id) is None:
                    session.add(
                        User(
                            id=user_id,
                            email=f"{user_id}@example.test",
                            role=Role.ADMIN,
                        )
                    )
                if await session.get(Session, f"test-session-{user_id}") is None:
                    session.add(Session(token=f"test-session-{user_id}", user_id=user_id))
                if await session.get(AdminMembership, user_id) is None:
                    session.add(
                        AdminMembership(
                            user_id=user_id,
                            organization_id="org_scenario_partner",
                            access_level=access_level,
                            status="active",
                            display_name=user_id,
                        )
                    )
                if await session.get(AdminArtistAssignment, (user_id, "artist_nova3")) is None:
                    session.add(
                        AdminArtistAssignment(admin_user_id=user_id, artist_id="artist_nova3")
                    )
            await session.commit()

    asyncio.run(add_partner_users())
    roles = dict(actors)
    roles.update(
        {
            "root": actors["admin"],
            "general_admin": actors["admin"],
            "artist_studio": actors["artist"],
            "partner_manager": _session_client(app, "test-session-scenario_partner_manager"),
            "partner_editor": _session_client(app, "test-session-scenario_partner_editor"),
        }
    )
    return roles


def _session_client(app: FastAPI, token: str) -> TestClient:
    client = TestClient(app)
    client.cookies.set("fanfolio_session", token)
    return client


def assert_success(response: Any, status_code: int = 200) -> dict[str, Any]:
    assert response.status_code == status_code, response.text
    body = response.json()
    assert body["ok"] is True
    return body["data"]


def assert_error(response: Any, status_code: int, code: str) -> None:
    assert response.status_code == status_code, response.text
    body = response.json()
    assert body["ok"] is False
    assert body["error"]["code"] == code
