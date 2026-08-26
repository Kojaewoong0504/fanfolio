from fastapi.testclient import TestClient

from tests.conftest import assert_error, assert_success


def test_fan_can_register_list_and_disable_push_device(actors: dict[str, TestClient]) -> None:
    fan = actors["fan"]
    token = "fcm-token-for-contract-test-12345678"

    registered = assert_success(
        fan.put(
            "/api/me/push-devices",
            json={"token": token, "platform": "web", "deviceName": "Chrome"},
        )
    )
    assert registered["platform"] == "web"
    assert registered["deviceName"] == "Chrome"
    assert registered["tokenPreview"] == "…12345678"
    assert token not in registered

    updated = assert_success(
        fan.put(
            "/api/me/push-devices",
            json={"token": token, "platform": "ios", "deviceName": "iPhone"},
        )
    )
    assert updated["deviceId"] == registered["deviceId"]
    assert updated["platform"] == "ios"
    assert updated["deviceName"] == "iPhone"

    listed = assert_success(fan.get("/api/me/push-devices"))
    assert [item["deviceId"] for item in listed["items"]] == [registered["deviceId"]]
    assert token not in listed

    removed = assert_success(fan.delete(f"/api/me/push-devices/{registered['deviceId']}"))
    assert removed == {"deviceId": registered["deviceId"], "enabled": False}
    assert assert_success(fan.get("/api/me/push-devices"))["items"] == []


def test_push_device_registration_is_scoped_and_validated(
    actors: dict[str, TestClient],
) -> None:
    fan = actors["fan"]
    token = "fcm-token-validation-12345678"
    assert_error(
        fan.put(
            "/api/me/push-devices",
            json={"token": token, "platform": "windows"},
        ),
        422,
        "VALIDATION_ERROR",
    )
    assert_error(
        fan.delete("/api/me/push-devices/missing-device"),
        404,
        "PUSH_DEVICE_NOT_FOUND",
    )
    assert assert_success(
        fan.request("DELETE", "/api/me/push-devices", json={"token": "missing-token"})
    ) == {"removed": False}


def test_push_device_endpoints_require_authentication(client: TestClient) -> None:
    response = client.get("/api/me/push-devices")
    assert_error(response, 401, "AUTH_REQUIRED")
