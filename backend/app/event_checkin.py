"""Signed, privacy-preserving passes used for in-person event check-in."""

import base64
import hashlib
import hmac
import json
import time
from typing import Any

from app.core.config import get_settings
from app.errors import AppError


def _encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def _signature(payload: str) -> str:
    digest = hmac.new(
        get_settings().download_signing_secret.encode("utf-8"),
        payload.encode("ascii"),
        hashlib.sha256,
    ).digest()
    return _encode(digest)


def create_check_in_token(*, event_id: str, application_id: str, expires_at: int) -> str:
    payload = _encode(
        json.dumps(
            {"eventId": event_id, "applicationId": application_id, "exp": expires_at},
            separators=(",", ":"),
        ).encode("utf-8")
    )
    return f"{payload}.{_signature(payload)}"


def verify_check_in_token(token: str) -> dict[str, Any]:
    try:
        payload, signature = token.split(".", 1)
        if not hmac.compare_digest(signature, _signature(payload)):
            raise ValueError
        data = json.loads(_decode(payload))
        if int(data["exp"]) <= int(time.time()):
            raise AppError(401, "EVENT_CHECKIN_EXPIRED", "체크인 패스가 만료되었습니다.")
        if not data.get("eventId") or not data.get("applicationId"):
            raise ValueError
        return data
    except AppError:
        raise
    except (ValueError, KeyError, TypeError, json.JSONDecodeError):
        raise AppError(401, "EVENT_CHECKIN_INVALID", "유효하지 않은 체크인 패스입니다.")


def check_in_token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
