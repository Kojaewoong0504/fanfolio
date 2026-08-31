from fastapi.testclient import TestClient

from tests.conftest import assert_success


def test_admin_operations_overview_returns_safe_queue_summary(
    actors: dict[str, TestClient],
) -> None:
    result = assert_success(actors["admin"].get("/api/admin/operations/overview"))

    assert set(result["queues"]) == {
        "failedDeliveries",
        "retryableDeliveries",
        "failedEngagementEvents",
        "openSupportTickets",
        "pendingTrades",
        "refundedOrders",
        "failedPointTransactions",
        "pointBalanceDrifts",
        "unclaimedRewards",
    }
    assert isinstance(result["recentActions"], list)
    assert "destination" not in str(result)


def test_operations_overview_requires_audit_read_permission(
    app, actors: dict[str, TestClient]
) -> None:
    from tests.contract.test_admin_notifications import create_platform_client

    viewer = create_platform_client(app, user_id="overview_viewer")
    response = viewer.get("/api/admin/operations/overview")
    assert response.status_code == 403


def test_root_admin_can_open_privacy_scoped_fan_360_view(
    actors: dict[str, TestClient],
) -> None:
    users = assert_success(actors["admin"].get("/api/admin/users?role=fan"))
    fan_id = users["items"][0]["id"]
    result = assert_success(actors["admin"].get(f"/api/admin/users/{fan_id}/360"))

    assert result["profile"]["id"] == fan_id
    assert set(result) == {
        "profile",
        "account",
        "cards",
        "orders",
        "trades",
        "pointLedger",
        "pointCharges",
        "supportTickets",
        "recentNotifications",
    }
    assert "password" not in str(result).lower()
