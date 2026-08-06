from __future__ import annotations

from importlib import import_module
from typing import Any

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
