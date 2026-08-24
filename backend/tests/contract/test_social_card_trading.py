from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.db.session import SessionLocal
from app.models import Card, TradeProposal, UserCard
from app.services import grant_user_card
from tests.conftest import assert_error, assert_success


def seed_social_cards() -> dict[str, str]:
    async def seed() -> dict[str, str]:
        async with SessionLocal() as session:
            session.add_all(
                [
                    Card(
                        id="social_tradeable_card",
                        name="거래 가능 카드",
                        status="published",
                        release_status="published",
                        artist_id="artist_nova3",
                        rarity="R",
                        image_url="/cards/tradeable.png",
                    ),
                    Card(
                        id="social_locked_card",
                        name="잠긴 카드",
                        status="published",
                        release_status="published",
                        artist_id="artist_nova3",
                        rarity="SR",
                        image_url="/cards/locked.png",
                    ),
                    Card(
                        id="social_expiring_card",
                        name="기간제 카드",
                        status="published",
                        release_status="published",
                        artist_id="artist_nova3",
                        rarity="N",
                        image_url="/cards/expiring.png",
                    ),
                    Card(
                        id="social_combination_card",
                        name="조합 카드",
                        status="published",
                        release_status="published",
                        artist_id="artist_nova3",
                        rarity="SR",
                        image_url="/cards/combination.png",
                    ),
                ]
            )
            cards = {
                "tradeable": "social_tradeable_card",
                "locked": "social_locked_card",
                "expiring": "social_expiring_card",
                "combination": "social_combination_card",
            }
            user_cards = {
                "tradeable": UserCard(
                    id="social_user_card_tradeable",
                    user_id="fan",
                    card_id=cards["tradeable"],
                    serial_number=1,
                    acquisition_source="card_pack",
                    acquired_at=datetime.now(UTC),
                ),
                "locked": UserCard(
                    id="social_user_card_locked",
                    user_id="fan",
                    card_id=cards["locked"],
                    serial_number=1,
                    acquisition_source="card_pack",
                    acquired_at=datetime.now(UTC),
                    trade_locked_at=datetime.now(UTC),
                ),
                "expiring": UserCard(
                    id="social_user_card_expiring",
                    user_id="fan",
                    card_id=cards["expiring"],
                    serial_number=1,
                    acquisition_source="card_pack",
                    acquired_at=datetime.now(UTC),
                    expires_at=datetime.now(UTC) + timedelta(hours=1),
                ),
                "combination": UserCard(
                    id="social_user_card_combination",
                    user_id="fan",
                    card_id=cards["combination"],
                    serial_number=1,
                    acquisition_source="combination",
                    acquired_at=datetime.now(UTC),
                ),
            }
            session.add_all(user_cards.values())
            await session.commit()
            return {**cards, **{f"userCard_{key}": value.id for key, value in user_cards.items()}}

    return asyncio.run(seed())


def test_fan_can_follow_and_trade_then_accept_transfers_cards(
    app: FastAPI, actors: dict[str, TestClient]
) -> None:
    ids = seed_social_cards()
    assert_success(
        actors["fan"].post("/api/me/follows/otherFan"),
        201,
    )
    public = assert_success(actors["otherFan"].get("/api/fans/otherFan/collection"))
    assert public["visibility"] == "public"
    assert public["cards"] == []

    proposal = assert_success(
        actors["fan"].post(
            "/api/me/trades",
            json={
                "recipientUserId": "otherFan",
                "offeredUserCardIds": [ids["userCard_tradeable"]],
                "requestedUserCardIds": [],
            },
        ),
        201,
    )
    accepted = assert_success(actors["otherFan"].post(f"/api/me/trades/{proposal['id']}/accept"))
    assert accepted["status"] == "accepted"
    collection = assert_success(actors["otherFan"].get("/api/me/collection"))
    assert collection["cards"][0]["userCardId"] == ids["userCard_tradeable"]


def test_trade_policy_rejects_expiring_combined_and_locked_cards(
    app: FastAPI, actors: dict[str, TestClient]
) -> None:
    ids = seed_social_cards()
    for key, code in (
        ("expiring", "CARD_NOT_TRADABLE"),
        ("locked", "CARD_NOT_TRADABLE"),
        ("combination", "CARD_NOT_TRADABLE"),
    ):
        assert_error(
            actors["fan"].post(
                "/api/me/trades",
                json={
                    "recipientUserId": "otherFan",
                    "offeredUserCardIds": [ids[f"userCard_{key}"]],
                    "requestedUserCardIds": [],
                },
            ),
            422,
            code,
        )


def test_private_collection_is_hidden_and_unfollow_is_idempotent(
    app: FastAPI, actors: dict[str, TestClient]
) -> None:
    assert_success(actors["otherFan"].put("/api/me/collection-visibility", json={"public": False}))
    assert_error(
        actors["fan"].get("/api/fans/otherFan/collection"),
        404,
        "COLLECTION_NOT_FOUND",
    )
    assert_success(actors["fan"].post("/api/me/follows/otherFan"), 201)
    assert_success(actors["fan"].delete("/api/me/follows/otherFan"))
    assert_success(actors["fan"].delete("/api/me/follows/otherFan"))


def test_fan_search_follow_connections_and_public_collection_summary(
    app: FastAPI, actors: dict[str, TestClient]
) -> None:
    assert_success(actors["fan"].post("/api/me/follows/otherFan"), 201)

    search = assert_success(actors["fan"].get("/api/fans", params={"query": "other"}))
    found = next(item for item in search["items"] if item["id"] == "otherFan")
    assert found["isFollowing"] is True
    assert found["followerCount"] == 1

    following = assert_success(actors["fan"].get("/api/me/follows", params={"kind": "following"}))
    assert [item["id"] for item in following["items"]] == ["otherFan"]

    followers = assert_success(
        actors["otherFan"].get("/api/me/follows", params={"kind": "followers"})
    )
    assert [item["id"] for item in followers["items"]] == ["fan"]

    public = assert_success(actors["fan"].get("/api/fans/otherFan/collection"))
    assert public["isFollowing"] is True
    assert public["summary"]["followerCount"] == 1
    assert public["summary"]["followingCount"] == 0
    assert "wantedCards" in public
    assert isinstance(public["wantedCards"], list)


def test_trade_inbox_detail_reject_cancel_and_expire_notifications(
    app: FastAPI, actors: dict[str, TestClient]
) -> None:
    ids = seed_social_cards()

    created = assert_success(
        actors["fan"].post(
            "/api/me/trades",
            json={
                "recipientUserId": "otherFan",
                "offeredUserCardIds": [ids["userCard_tradeable"]],
                "requestedUserCardIds": [],
            },
        ),
        201,
    )
    sent = assert_success(actors["fan"].get("/api/me/trades", params={"box": "sent"}))
    received = assert_success(actors["otherFan"].get("/api/me/trades", params={"box": "received"}))
    assert sent["items"][0]["id"] == created["id"]
    assert received["items"][0]["id"] == created["id"]
    assert sent["items"][0]["offeredCards"][0]["userCardId"] == ids["userCard_tradeable"]

    detail = assert_success(actors["otherFan"].get(f"/api/me/trades/{created['id']}"))
    assert detail["proposer"]["id"] == "fan"
    assert detail["recipient"]["id"] == "otherFan"
    assert detail["offeredCards"][0]["name"] == "거래 가능 카드"

    rejected = assert_success(actors["otherFan"].post(f"/api/me/trades/{created['id']}/reject"))
    assert rejected["status"] == "rejected"
    notifications = assert_success(actors["fan"].get("/api/notifications"))
    assert any(item["kind"] == "trade_rejected" for item in notifications["items"])

    cancelled_proposal = assert_success(
        actors["fan"].post(
            "/api/me/trades",
            json={
                "recipientUserId": "otherFan",
                "offeredUserCardIds": [ids["userCard_tradeable"]],
                "requestedUserCardIds": [],
            },
        ),
        201,
    )
    cancelled = assert_success(
        actors["fan"].post(f"/api/me/trades/{cancelled_proposal['id']}/cancel")
    )
    assert cancelled["status"] == "cancelled"
    recipient_notifications = assert_success(actors["otherFan"].get("/api/notifications"))
    assert any(item["kind"] == "trade_cancelled" for item in recipient_notifications["items"])

    expiring = assert_success(
        actors["fan"].post(
            "/api/me/trades",
            json={
                "recipientUserId": "otherFan",
                "offeredUserCardIds": [ids["userCard_tradeable"]],
                "requestedUserCardIds": [],
            },
        ),
        201,
    )

    async def expire_proposal() -> None:
        async with SessionLocal() as session:
            proposal = await session.get(TradeProposal, expiring["id"])
            assert proposal is not None
            proposal.expires_at = datetime.now(UTC) - timedelta(seconds=1)
            await session.commit()

    asyncio.run(expire_proposal())
    expired = assert_success(actors["otherFan"].get("/api/me/trades", params={"box": "received"}))
    assert expired["items"][0]["status"] == "expired"
    expired_notifications = assert_success(actors["fan"].get("/api/notifications"))
    assert any(item["kind"] == "trade_expired" for item in expired_notifications["items"])


def test_followers_are_notified_when_a_public_fan_collects_a_card(
    app: FastAPI, actors: dict[str, TestClient]
) -> None:
    ids = seed_social_cards()
    assert_success(actors["fan"].post("/api/me/follows/otherFan"), 201)

    async def collect_card() -> None:
        async with SessionLocal() as session:
            await grant_user_card(
                session,
                user_id="otherFan",
                card_id=ids["tradeable"],
                source_type="test_followed_collection",
                source_id="followed-card-1",
                acquisition_source="card_pack",
            )
            await session.commit()

    asyncio.run(collect_card())
    notifications = assert_success(actors["fan"].get("/api/notifications"))
    activity = next(
        item for item in notifications["items"] if item["kind"] == "following_card_collected"
    )
    assert activity["entityType"] == "fan"
    assert activity["entityId"] == "otherFan"


def test_local_demo_seed_drives_real_auth_search_collection_and_trade_apis(
    app: FastAPI, seeded: dict[str, object]
) -> None:
    from app import services

    ensure_demo = getattr(services, "ensure_fan_community_demo", None)
    assert callable(ensure_demo), "로컬 팬 커뮤니티 시드 서비스가 필요합니다."

    password = "Fanfolio-demo-2026"

    async def seed_twice() -> tuple[dict[str, object], dict[str, object]]:
        async with SessionLocal() as session:
            first = await ensure_demo(session, password=password)
        async with SessionLocal() as session:
            second = await ensure_demo(session, password=password)
        return first, second

    first, second = asyncio.run(seed_twice())
    assert first == second

    fan = TestClient(app)
    fan_login = assert_success(
        fan.post(
            "/api/auth/fan/login",
            headers={"X-Fanfolio-Client": "fan"},
            json={"email": "demo.fan@example.com", "password": password},
        )
    )
    fan_headers = {
        "Authorization": f"Bearer {fan_login['accessToken']}",
        "X-Fanfolio-Client": "fan",
    }

    search = assert_success(fan.get("/api/fans", headers=fan_headers))
    collector = next(item for item in search["items"] if item["id"] == "local_demo_collector")
    assert collector["nickname"] == "별빛수집가"
    assert collector["ownedCount"] >= 2
    assert collector["tradableCount"] >= 2
    assert collector["favoriteArtists"] == [
        {
            "id": "artist_nova3",
            "name": "드림스케이프",
            "imageUrl": collector["favoriteArtists"][0]["imageUrl"],
        }
    ]
    assert len(collector["previewCards"]) >= 2
    assert all(card["imageUrl"] for card in collector["previewCards"])
    assert collector["latestCardAt"]
    assert collector["matchingWishlistCount"] == 0

    card_search = assert_success(
        fan.get("/api/fans", headers=fan_headers, params={"query": "Minjae"})
    )
    assert [item["id"] for item in card_search["items"]] == ["local_demo_collector"]

    public = assert_success(
        fan.get("/api/fans/local_demo_collector/collection", headers=fan_headers)
    )
    assert public["profileImageUrl"]
    packs = assert_success(fan.get("/api/catalog/card-packs", headers=fan_headers))
    demo_pack = next(pack for pack in packs["items"] if pack["id"] == "local_demo_pack_dreamscape")
    assert public["featuredPackId"] == demo_pack["id"]
    assert {card["cardId"] for card in demo_pack["cards"]} == {
        "local_demo_card_harin",
        "local_demo_card_doyun",
        "local_demo_card_minjae",
        "local_demo_card_jay",
    }
    requested = next(card for card in public["cards"] if card["tradable"])
    mine = assert_success(fan.get("/api/me/collection", headers=fan_headers))
    offered = next(card for card in mine["cards"] if card["tradable"])

    proposal = assert_success(
        fan.post(
            "/api/me/trades",
            headers=fan_headers,
            json={
                "recipientUserId": "local_demo_collector",
                "offeredUserCardIds": [offered["userCardId"]],
                "requestedUserCardIds": [requested["userCardId"]],
            },
        ),
        201,
    )
    sent = assert_success(fan.get("/api/me/trades", headers=fan_headers, params={"box": "sent"}))
    assert sent["items"][0]["id"] == proposal["id"]

    collector_client = TestClient(app)
    collector_login = assert_success(
        collector_client.post(
            "/api/auth/fan/login",
            headers={"X-Fanfolio-Client": "fan"},
            json={"email": "demo.collector@example.com", "password": password},
        )
    )
    collector_headers = {
        "Authorization": f"Bearer {collector_login['accessToken']}",
        "X-Fanfolio-Client": "fan",
    }
    accepted = assert_success(
        collector_client.post(
            f"/api/me/trades/{proposal['id']}/accept",
            headers=collector_headers,
        )
    )
    assert accepted["status"] == "accepted"

    fan_after = assert_success(fan.get("/api/me/collection", headers=fan_headers))
    collector_after = assert_success(
        collector_client.get("/api/me/collection", headers=collector_headers)
    )
    assert requested["userCardId"] in {card["userCardId"] for card in fan_after["cards"]}
    assert offered["userCardId"] in {card["userCardId"] for card in collector_after["cards"]}
