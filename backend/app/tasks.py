import asyncio

from celery import Celery
from starlette.background import BackgroundTasks

from app.core.config import get_settings
from app.services import (
    cleanup_expired_uploads,
    process_background_removal,
    process_engagement_event,
)

settings = get_settings()
celery_app = Celery("fanfolio", broker=settings.celery_broker_url)
celery_app.conf.update(
    result_backend=settings.celery_result_backend,
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    beat_schedule={
        "cleanup-expired-uploads": {
            "task": "fanfolio.cleanup_expired_uploads",
            "schedule": settings.upload_cleanup_interval_seconds,
        }
    },
)


@celery_app.task(name="fanfolio.process_background_removal")
def process_background_removal_task(job_id: str) -> None:
    """Celery entry point; the async service remains shared with local execution."""
    asyncio.run(process_background_removal(job_id))


def enqueue_background_removal(job_id: str, background_tasks: BackgroundTasks) -> None:
    """Select the local or distributed queue without changing the API contract."""
    if settings.task_queue_mode == "celery":
        process_background_removal_task.delay(job_id)
        return
    background_tasks.add_task(process_background_removal, job_id)


@celery_app.task(name="fanfolio.process_engagement_event")
def process_engagement_event_task(event_id: str) -> None:
    """Celery entry point; the async service remains shared with local execution."""
    asyncio.run(process_engagement_event(event_id))


def enqueue_engagement_event(event_id: str, background_tasks: BackgroundTasks) -> None:
    """Queue growth processing after the redemption transaction has committed."""
    if settings.task_queue_mode == "celery":
        process_engagement_event_task.delay(event_id)
        return
    background_tasks.add_task(process_engagement_event, event_id)


@celery_app.task(name="fanfolio.cleanup_expired_uploads")
def cleanup_expired_uploads_task() -> int:
    """Periodic worker entry point; schedule it with Celery Beat in production."""
    return asyncio.run(cleanup_expired_uploads())
