"""HMAC signer used by local delivery and replaceable by object storage later."""

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


def create_download_token(*, user_id: str, campaign_id: str, asset_id: str) -> str:
    payload = _encode(
        json.dumps(
            {
                "userId": user_id,
                "campaignId": campaign_id,
                "assetId": asset_id,
                "exp": int(time.time()) + get_settings().download_url_ttl_seconds,
            },
            separators=(",", ":"),
        ).encode("utf-8")
    )
    return f"{payload}.{_signature(payload)}"


def verify_download_token(token: str) -> dict[str, Any]:
    try:
        payload, signature = token.split(".", 1)
        if not hmac.compare_digest(signature, _signature(payload)):
            raise ValueError
        data = json.loads(_decode(payload))
        if int(data["exp"]) <= int(time.time()):
            raise AppError(401, "SIGNED_URL_EXPIRED", "다운로드 링크가 만료되었습니다.")
        return data
    except AppError:
        raise
    except (ValueError, KeyError, TypeError, json.JSONDecodeError):
        raise AppError(401, "SIGNED_URL_INVALID", "유효하지 않은 다운로드 링크입니다.")


def download_url(*, user_id: str, campaign_id: str, asset_id: str) -> str:
    token = create_download_token(user_id=user_id, campaign_id=campaign_id, asset_id=asset_id)
    return f"/api/me/collection/benefits/{campaign_id}/download?token={token}"
