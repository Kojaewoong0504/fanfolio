import asyncio

from sqlalchemy import select

from app.db.session import SessionLocal
from app.models import (
    Artist,
    Card,
    CardPack,
    CardPackCard,
    Member,
    PassSeason,
    PassTier,
    RewardCatalog,
    ShopProduct,
)
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


def test_demo_catalog_bootstrap_creates_a_public_paid_season_pass(client) -> None:
    assert client.post("/api/test/reset").status_code == 204

    async def bootstrap() -> None:
        async with SessionLocal() as session:
            await ensure_demo_catalog(session)

    asyncio.run(bootstrap())

    async def read_pass() -> tuple[PassSeason, list[PassTier], list[RewardCatalog]]:
        async with SessionLocal() as session:
            season = await session.get(PassSeason, "demo_pass_dreamscape_s01")
            tiers = list(
                await session.scalars(
                    select(PassTier)
                    .where(PassTier.season_id == "demo_pass_dreamscape_s01")
                    .order_by(PassTier.tier)
                )
            )
            rewards = list(
                await session.scalars(
                    select(RewardCatalog).where(RewardCatalog.id.like("demo_pass_s01_%"))
                )
            )
            assert season is not None
            return season, tiers, rewards

    season, tiers, rewards = asyncio.run(read_pass())
    assert season.status == "published"
    assert season.is_paid is True
    assert season.premium_enabled is True
    assert season.premium_price_points == 1200
    assert len(tiers) == 12
    assert all(tier.reward_id and tier.premium_reward_id for tier in tiers)
    assert len(rewards) == 24
    assert rewards[0].metadata_["imagePreset"] == "ticket"
    assert rewards[1].metadata_["imagePreset"] == "vip"
