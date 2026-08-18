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
