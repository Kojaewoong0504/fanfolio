import asyncio
from typing import Any

from starlette.background import BackgroundTasks

from app import tasks


def test_enqueue_engagement_event_inline_dispatches_shared_consumer(monkeypatch: Any) -> None:
    consumed: list[str] = []

    async def fake_process_engagement_event(event_id: str) -> None:
        consumed.append(event_id)

    monkeypatch.setattr(tasks.settings, "task_queue_mode", "inline")
    monkeypatch.setattr(tasks, "process_engagement_event", fake_process_engagement_event)

    background_tasks = BackgroundTasks()
    tasks.enqueue_engagement_event("evt_inline_test", background_tasks)

    assert len(background_tasks.tasks) == 1
    queued = background_tasks.tasks[0]
    assert queued.func is fake_process_engagement_event
    assert queued.args == ("evt_inline_test",)
    assert queued.kwargs == {}

    asyncio.run(background_tasks())

    assert consumed == ["evt_inline_test"]


def test_enqueue_engagement_event_celery_mode_dispatches_shared_task(monkeypatch: Any) -> None:
    dispatched: list[str] = []

    monkeypatch.setattr(tasks.settings, "task_queue_mode", "celery")
    monkeypatch.setattr(
        tasks.process_engagement_event_task,
        "delay",
        lambda event_id: dispatched.append(event_id),
    )

    tasks.enqueue_engagement_event("evt_celery_test", BackgroundTasks())

    assert dispatched == ["evt_celery_test"]


def test_process_engagement_event_celery_task_runs_shared_consumer(monkeypatch: Any) -> None:
    consumed: list[str] = []

    async def fake_process_engagement_event(event_id: str) -> None:
        consumed.append(event_id)

    monkeypatch.setattr(tasks, "process_engagement_event", fake_process_engagement_event)

    tasks.process_engagement_event_task.run("evt_worker_test")

    assert consumed == ["evt_worker_test"]
