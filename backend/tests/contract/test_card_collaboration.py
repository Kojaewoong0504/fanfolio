from fastapi import FastAPI
from fastapi.testclient import TestClient

from tests.conftest import assert_error, assert_success


def create_studio_card(artist: TestClient, seeded: dict) -> dict:
    return assert_success(
        artist.post(
            "/api/artist/cards",
            json={
                "templateId": seeded["ids"]["templateId"],
                "name": "협업 코멘트 테스트 카드",
                "seasonName": "2026 SPRING",
                "rarity": "SR",
                "imageAssetId": seeded["ids"]["imageAssetId"],
                "issueLimit": 100,
            },
        ),
        201,
    )


def test_artist_can_create_list_and_resolve_card_collaboration_comment(
    app: FastAPI, actors: dict[str, TestClient], seeded: dict
) -> None:
    card = create_studio_card(actors["artist"], seeded)
    comment = assert_success(
        actors["artist"].post(
            f"/api/artist/cards/{card['id']}/comments",
            json={"body": "이미지 우측 여백을 한 번 더 확인해 주세요.", "mentionUserId": "admin"},
        ),
        201,
    )
    assert comment["cardId"] == card["id"]
    assert comment["status"] == "open"
    assert comment["mentionUserId"] == "admin"

    listed = assert_success(actors["artist"].get(f"/api/artist/cards/{card['id']}/comments"))
    assert listed["items"][0]["body"] == "이미지 우측 여백을 한 번 더 확인해 주세요."

    resolved = assert_success(
        actors["artist"].patch(
            f"/api/artist/cards/{card['id']}/comments/{comment['id']}",
            json={"status": "resolved"},
        )
    )
    assert resolved["status"] == "resolved"


def test_card_collaboration_comment_rejects_blank_body(
    app: FastAPI, actors: dict[str, TestClient], seeded: dict
) -> None:
    card = create_studio_card(actors["artist"], seeded)
    assert_error(
        actors["artist"].post(f"/api/artist/cards/{card['id']}/comments", json={"body": "   "}),
        422,
        "VALIDATION_ERROR",
    )


def test_admin_can_review_card_collaboration_comments(
    app: FastAPI, actors: dict[str, TestClient], seeded: dict
) -> None:
    card = create_studio_card(actors["artist"], seeded)
    assert_success(
        actors["artist"].post(
            f"/api/artist/cards/{card['id']}/comments",
            json={"body": "운영 검수에서 확인할 메모입니다."},
        ),
        201,
    )
    listed = assert_success(actors["admin"].get(f"/api/admin/cards/{card['id']}/comments"))
    assert listed["items"][0]["body"] == "운영 검수에서 확인할 메모입니다."
