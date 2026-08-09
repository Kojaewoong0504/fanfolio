import asyncio
from unittest.mock import AsyncMock, Mock

import pytest

from app.core.config import Settings
from app.models import DeploymentIdentity
from app.services import ensure_data_identity


def run(coro):
    return asyncio.run(coro)


def test_production_replacement_database_is_rejected_without_bootstrap_switch(monkeypatch) -> None:
    settings = Settings(
        app_env="production",
        data_protection_key="x" * 32,
        allow_data_bootstrap=False,
    )
    monkeypatch.setattr("app.services.get_settings", lambda: settings)
    session = AsyncMock()
    session.add = Mock()
    session.get.return_value = None

    with pytest.raises(RuntimeError, match="DATA_STORE_NOT_INITIALIZED"):
        run(ensure_data_identity(session))

    session.add.assert_not_called()
    session.commit.assert_not_awaited()


def test_first_durable_database_can_be_explicitly_initialized_once(monkeypatch) -> None:
    settings = Settings(
        app_env="production",
        data_protection_key="x" * 32,
        allow_data_bootstrap=True,
    )
    monkeypatch.setattr("app.services.get_settings", lambda: settings)
    session = AsyncMock()
    session.add = Mock()
    session.get.return_value = None

    run(ensure_data_identity(session))

    identity = session.add.call_args.args[0]
    assert isinstance(identity, DeploymentIdentity)
    assert identity.id == "primary"
    assert identity.key_digest
    session.commit.assert_awaited_once()


def test_database_with_another_protection_key_is_rejected(monkeypatch) -> None:
    settings = Settings(
        app_env="production",
        data_protection_key="x" * 32,
    )
    monkeypatch.setattr("app.services.get_settings", lambda: settings)
    session = AsyncMock()
    session.get.return_value = DeploymentIdentity(id="primary", key_digest="wrong")

    with pytest.raises(RuntimeError, match="DATA_STORE_IDENTITY_MISMATCH"):
        run(ensure_data_identity(session))

    session.commit.assert_not_awaited()
