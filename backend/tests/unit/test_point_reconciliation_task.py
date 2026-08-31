import asyncio
import logging


def test_reconciliation_task_returns_count_and_logs_drift(monkeypatch, caplog):
    from app import tasks

    class Session:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

    class SessionFactory:
        def __call__(self):
            return Session()

    monkeypatch.setattr(tasks, "SessionLocal", SessionFactory())
    monkeypatch.setattr(
        tasks,
        "reconcile_point_balances",
        lambda session: _drifts(),
    )
    with caplog.at_level(logging.WARNING, logger="app.tasks"):
        result = asyncio.run(tasks._reconcile_point_balances_task())

    assert result == 1
    assert "point balance reconciliation found drift" in caplog.text


async def _drifts():
    return [{"userId": "fan-1", "difference": 10}]


def test_reconciliation_beat_schedule_is_configured():
    from app.tasks import celery_app

    entry = celery_app.conf.beat_schedule["reconcile-point-balances"]
    assert entry["task"] == "fanfolio.reconcile_point_balances"
    assert entry["schedule"] > 0
