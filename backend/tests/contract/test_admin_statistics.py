from typing import Any

from fastapi.testclient import TestClient

from tests.conftest import assert_error, assert_success


def test_root_statistics_tracks_redemption_and_collection_view(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    fan = actors["fan"]
    root = actors["admin"]

    redeemed = assert_success(
        fan.post(
            "/api/redemptions",
            json={"code": seeded["codes"]["valid"], "source": "manual"},
        ),
        201,
    )
    assert_success(fan.get(f"/api/me/cards/{redeemed['userCardId']}"))

    statistics = assert_success(root.get("/api/admin/statistics?period=30&compare=true"))

    assert statistics["scope"]["kind"] == "root"
    assert statistics["period"]["days"] == 30
    assert statistics["trackingSince"]
    assert statistics["kpis"]["issuedCards"]["current"] >= 1
    assert statistics["kpis"]["activeFans"]["current"] >= 1
    assert statistics["kpis"]["combinations"]["current"] >= 0
    assert statistics["kpis"]["trades"]["current"] >= 0
    funnel = {row["key"]: row for row in statistics["funnel"]}
    assert funnel["recognized"]["count"] >= 1
    assert funnel["registered"]["count"] >= 1
    assert funnel["collectionViewed"]["count"] >= 1
    assert isinstance(statistics["trend"], list)
    assert isinstance(statistics["packPerformance"], list)
    assert isinstance(statistics["oddsIntegrity"], list)


def test_partner_statistics_is_scoped_and_rejects_another_organization(
    seeded_roles: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    partner = seeded_roles["partner_manager"]

    statistics = assert_success(partner.get("/api/admin/statistics?period=7"))
    assert statistics["scope"]["kind"] == "partner"
    assert statistics["scope"]["organizationId"] == "org_scenario_partner"
    assert all(artist["id"] == "artist_nova3" for artist in statistics["filters"]["artists"])

    response = partner.get(
        "/api/admin/statistics?period=7&organizationId=org_outside_partner_scope"
    )
    assert_error(response, 404, "RESOURCE_NOT_FOUND")


def test_statistics_rejects_an_invalid_period(actors: dict[str, TestClient]) -> None:
    response = actors["admin"].get("/api/admin/statistics?period=14")
    assert response.status_code == 422


def test_statistics_tracks_failed_redemption_attempts(
    actors: dict[str, TestClient], seeded: dict[str, Any]
) -> None:
    fan = actors["fan"]
    root = actors["admin"]

    response = fan.post(
        "/api/redemptions",
        json={"code": "missing-statistics-code", "source": "manual"},
    )
    assert_error(response, 404, "REDEEM_CODE_NOT_FOUND")

    statistics = assert_success(root.get("/api/admin/statistics?period=7"))
    assert statistics["operationHealth"]["redemptionFailures"] >= 1
