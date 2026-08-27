from typing import Any

from fastapi.testclient import TestClient

from tests.conftest import assert_success


def test_home_returns_published_catalog_cards_for_new_cards(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    home = assert_success(actors["fan"].get("/api/home"))

    card = next(item for item in home["newCards"] if item["id"] == seeded["ids"]["publishedCardId"])
    assert card["status"] == "published"
    assert card["isOfficial"] is True
    assert card["name"]
    assert card["imageUrl"]


def test_home_shows_cards_from_all_favorite_artists(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    fan = actors["fan"]
    admin = actors["admin"]
    assert_success(
        fan.patch(
            "/api/me/profile",
            json={
                "nickname": "루미너스 팬",
                "favoriteArtistIds": ["artist_luminous", "artist_nova3"],
                "favoriteMemberIds": ["member_luminous_arin"],
            },
        )
    )

    card = assert_success(
        admin.post(
            "/api/admin/cards",
            json={
                "name": "관심 아티스트 신규 카드",
                "artistId": "artist_luminous",
                "memberId": "member_luminous_arin",
                "rarity": "SR",
            },
        ),
        201,
    )
    assert_success(admin.post(f"/api/admin/cards/{card['id']}/publish"))

    home = assert_success(fan.get("/api/home"))
    assert home["newCards"]
    assert {item["artistId"] for item in home["newCards"]} >= {
        "artist_luminous",
        "artist_nova3",
    }


def test_home_returns_all_favorite_artists(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    fan = actors["fan"]
    assert_success(
        fan.patch(
            "/api/me/profile",
            json={
                "nickname": "여러 그룹 팬",
                "favoriteArtistIds": ["artist_luminous", "artist_nova3"],
                "favoriteMemberIds": ["member_luminous_arin"],
            },
        )
    )

    home = assert_success(fan.get("/api/home"))

    assert {artist["id"] for artist in home["favoriteArtists"]} == {
        "artist_luminous",
        "artist_nova3",
    }
    assert home["favoriteArtist"] is None
