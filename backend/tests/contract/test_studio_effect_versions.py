import asyncio
from datetime import UTC, datetime

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.db.session import SessionLocal
from app.models import Card, UserCard
from tests.conftest import assert_error, assert_success


def create_studio_card(artist: TestClient, seeded: dict) -> dict:
    return assert_success(
        artist.post(
            "/api/artist/cards",
            json={
                "templateId": seeded["ids"]["templateId"],
                "name": "효과 프리셋 테스트 카드",
                "seasonName": "2026 SPRING",
                "rarity": "Special",
                "imageAssetId": seeded["ids"]["imageAssetId"],
                "issueLimit": 100,
            },
        ),
        201,
    )


def test_artist_effect_version_rejects_unsafe_config_and_accepts_preset(
    app: FastAPI, actors: dict[str, TestClient], seeded: dict
) -> None:
    card = create_studio_card(actors["artist"], seeded)

    assert_error(
        actors["artist"].post(
            f"/api/artist/cards/{card['id']}/effect-versions",
            json={
                "designConfig": {
                    "front": {
                        "preset": "unknown",
                        "intensity": 2,
                        "particleCount": 100,
                    }
                }
            },
        ),
        422,
        "INVALID_EFFECT_CONFIG",
    )

    version = assert_success(
        actors["artist"].post(
            f"/api/artist/cards/{card['id']}/effect-versions",
            json={
                "designConfig": {
                    "version": 3,
                    "front": {
                        "preset": "hologram",
                        "intensity": 0.72,
                        "speed": 0.4,
                        "particleCount": 12,
                        "color": "#A855F7",
                        "interaction": "tilt",
                    },
                    "back": {"preset": "none", "interaction": "tilt"},
                }
            },
        ),
        201,
    )
    assert version["status"] == "draft"
    assert version["version"] == 1


def test_artist_effect_version_normalizes_legacy_studio_preset_names(
    app: FastAPI, actors: dict[str, TestClient], seeded: dict
) -> None:
    card = create_studio_card(actors["artist"], seeded)

    version = assert_success(
        actors["artist"].post(
            f"/api/artist/cards/{card['id']}/effect-versions",
            json={"designConfig": {"front": {"effectPreset": "stardust"}}},
        ),
        201,
    )

    assert version["designConfig"]["front"]["preset"] == "hologram"


def test_artist_cannot_mutate_effect_versions_for_a_released_card(
    app: FastAPI, actors: dict[str, TestClient], seeded: dict
) -> None:
    card = create_studio_card(actors["artist"], seeded)

    async def release_card() -> None:
        async with SessionLocal() as session:
            persisted_card = await session.get(Card, card["id"])
            assert persisted_card is not None
            persisted_card.status = "published"
            persisted_card.release_status = "published"
            await session.commit()

    asyncio.run(release_card())

    assert_error(
        actors["artist"].post(
            f"/api/artist/cards/{card['id']}/effect-versions",
            json={"designConfig": {"front": {"preset": "glow"}}},
        ),
        409,
        "INVALID_CARD_STATUS",
    )


def test_effect_config_rejects_back_lenticular_and_unsafe_asset_references(
    app: FastAPI, actors: dict[str, TestClient], seeded: dict
) -> None:
    card = create_studio_card(actors["artist"], seeded)

    for config in (
        {"back": {"preset": "foil", "interaction": "lenticular"}},
        {"front": {"preset": "particles", "color": "javascript:alert(1)"}},
    ):
        assert_error(
            actors["artist"].post(
                f"/api/artist/cards/{card['id']}/effect-versions",
                json={"designConfig": config},
            ),
            422,
            "INVALID_EFFECT_CONFIG",
        )


def test_unapproved_effect_version_is_not_fan_visible_and_admin_can_approve(
    app: FastAPI, actors: dict[str, TestClient], seeded: dict
) -> None:
    card = create_studio_card(actors["artist"], seeded)
    user_card_id = f"user_effect_visibility_{card['id']}"

    async def attach_card_to_fan() -> None:
        async with SessionLocal() as session:
            persisted_card = await session.get(Card, card["id"])
            assert persisted_card is not None
            persisted_card.design_config = {"front": {"preset": "light", "interaction": "tilt"}}
            session.add(
                UserCard(
                    id=user_card_id,
                    user_id="fan",
                    card_id=card["id"],
                    serial_number=1,
                    acquisition_source="studio_test",
                    acquired_at=datetime.now(UTC),
                )
            )
            await session.commit()

    asyncio.run(attach_card_to_fan())
    version = assert_success(
        actors["artist"].post(
            f"/api/artist/cards/{card['id']}/effect-versions",
            json={"designConfig": {"front": {"preset": "glow", "interaction": "tilt"}}},
        ),
        201,
    )

    assert_success(
        actors["artist"].post(
            f"/api/artist/cards/{card['id']}/effect-versions/{version['id']}/submit-review"
        )
    )
    admin_card = assert_success(actors["admin"].get(f"/api/admin/cards/{card['id']}"))
    assert admin_card["designConfig"]["front"]["preset"] == "light"

    fan_card = assert_success(actors["fan"].get(f"/api/me/cards/{user_card_id}"))
    assert fan_card["card"]["designConfig"] is None

    approved = assert_success(
        actors["admin"].post(
            f"/api/admin/cards/{card['id']}/effect-versions/{version['id']}/approve"
        )
    )
    assert approved["status"] == "approved"
    admin_card = assert_success(actors["admin"].get(f"/api/admin/cards/{card['id']}"))
    assert admin_card["designConfig"]["front"]["preset"] == "glow"
    fan_card = assert_success(actors["fan"].get(f"/api/me/cards/{user_card_id}"))
    assert fan_card["card"]["designConfig"]["front"]["preset"] == "glow"
