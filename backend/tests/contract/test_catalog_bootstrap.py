import asyncio

from sqlalchemy import select

from app.db.session import SessionLocal
from app.models import Artist, Card, Member
from app.services import ensure_demo_catalog


def test_demo_catalog_bootstrap_creates_onboarding_catalog(client) -> None:
    assert client.post("/api/test/reset").status_code == 204

    async def bootstrap() -> None:
        async with SessionLocal() as session:
            await ensure_demo_catalog(session)

    asyncio.run(bootstrap())

    async def read_catalog() -> tuple[int, int, int]:
        async with SessionLocal() as session:
            artists = await session.scalars(select(Artist))
            members = await session.scalars(select(Member))
            cards = await session.scalars(select(Card).where(Card.status == "published"))
            return len(list(artists)), len(list(members)), len(list(cards))

    assert asyncio.run(read_catalog()) == (4, 12, 1)
