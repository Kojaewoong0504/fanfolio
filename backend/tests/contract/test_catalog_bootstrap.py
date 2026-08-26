import asyncio

from sqlalchemy import select

from app.db.session import SessionLocal
from app.models import Artist, Card, CardPack, CardPackCard, Member, ShopProduct
from app.services import ensure_demo_catalog


def test_demo_catalog_bootstrap_creates_onboarding_catalog(client) -> None:
    assert client.post("/api/test/reset").status_code == 204

    async def bootstrap() -> None:
        async with SessionLocal() as session:
            await ensure_demo_catalog(session)

    asyncio.run(bootstrap())

    async def read_catalog() -> tuple[int, int, int, int, int, int, list[tuple[str, str, str]]]:
        async with SessionLocal() as session:
            artists = await session.scalars(select(Artist))
            members = await session.scalars(select(Member))
            cards = await session.scalars(select(Card).where(Card.status == "published"))
            packs = await session.scalars(select(CardPack).where(CardPack.status == "published"))
            products = await session.scalars(
                select(ShopProduct).where(ShopProduct.status == "published")
            )
            links = await session.scalars(
                select(CardPackCard).where(CardPackCard.pack_id == "demo_pack_dreamscape_nebula")
            )
            dreamscape_members = await session.scalars(
                select(Member).where(Member.artist_id == "artist_nova3").order_by(Member.id)
            )
            return (
                len(list(artists)),
                len(list(members)),
                len(list(cards)),
                len(list(packs)),
                len(list(products)),
                len(list(links)),
                [(member.id, member.name, member.image_url or "") for member in dreamscape_members],
            )

    assert asyncio.run(read_catalog()) == (
        4,
        13,
        4,
        1,
        1,
        4,
        [
            ("member_jei", "세나", "/assets/demo/dreamscape/sena.png"),
            ("member_minho", "하린", "/assets/demo/dreamscape/harin.png"),
            ("member_rina", "리나", "/assets/demo/dreamscape/rina.png"),
            ("member_yuna", "유나", "/assets/demo/dreamscape/yuna.png"),
        ],
    )


def test_bundled_demo_assets_are_served_by_api(client) -> None:
    response = client.get("/assets/demo/dreamscape/group.png")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("image/png")
    assert len(response.content) > 100_000
