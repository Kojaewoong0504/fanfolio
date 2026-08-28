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
    User,
)
from app.services import ensure_demo_catalog, repair_demo_catalog_asset_urls


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
        7,
        2,
        2,
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


def test_demo_catalog_image_urls_are_backend_served_assets(client, seeded) -> None:
    """Fresh deployments must not persist frontend source paths in catalog data."""
    client.cookies.set("fanfolio_session", seeded["sessions"]["fan"])

    async def bootstrap() -> None:
        async with SessionLocal() as session:
            await ensure_demo_catalog(session)

    asyncio.run(bootstrap())

    response = client.get("/api/catalog/artists")
    assert response.status_code == 200, response.text
    artists = response.json()["data"]["items"]
    image_urls = {artist["imageUrl"] for artist in artists}
    assert all(url.startswith("/assets/") for url in image_urls)
    assert all(not url.startswith("/src/") for url in image_urls)

    for url in image_urls:
        response = client.get(url)
        assert response.status_code == 200, url
        assert response.headers["content-type"].startswith("image/")


def test_legacy_demo_asset_urls_are_repaired_without_creating_records(client, seeded) -> None:
    client.cookies.set("fanfolio_session", seeded["sessions"]["fan"])

    async def repair() -> int:
        async with SessionLocal() as session:
            artist = await session.get(Artist, "artist_luminous")
            assert artist is not None
            artist.image_url = "/src/assets/legacy.png"
            user = await session.get(User, "local_demo_fan")
            assert user is None
            await session.commit()
            return await repair_demo_catalog_asset_urls(session)

    assert asyncio.run(repair()) == 1
    artists = client.get("/api/catalog/artists").json()["data"]["items"]
    assert (
        next(item for item in artists if item["id"] == "artist_luminous")["imageUrl"]
        == "/assets/card-yuna-lavender.jpg"
    )


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


def test_demo_catalog_bootstrap_includes_a_second_artist_catalog(client) -> None:
    assert client.post("/api/test/reset").status_code == 204

    async def bootstrap() -> None:
        async with SessionLocal() as session:
            await ensure_demo_catalog(session)

    asyncio.run(bootstrap())

    async def read_luminous() -> tuple[list[str], list[str], list[str]]:
        async with SessionLocal() as session:
            cards = list(
                await session.scalars(select(Card.id).where(Card.artist_id == "artist_luminous"))
            )
            packs = list(
                await session.scalars(
                    select(CardPack.id).where(CardPack.artist_id == "artist_luminous")
                )
            )
            products = list(
                await session.scalars(
                    select(ShopProduct.id).where(ShopProduct.artist_id == "artist_luminous")
                )
            )
            return cards, packs, products

    cards, packs, products = asyncio.run(read_luminous())
    assert cards == [
        "card_demo_luminous_arin",
        "card_demo_luminous_ian",
        "card_demo_luminous_sena",
    ]
    assert packs == ["demo_pack_luminous_aurora"]
    assert products == ["demo_shop_luminous_aurora"]
