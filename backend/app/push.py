"""Push notification delivery adapters.

In-app notifications remain the durable source of truth. This module only
delivers an optional device notification after an event has been recorded.
Firebase HTTP v1 is used directly so the backend does not need a heavyweight
provider SDK or any client credential in the browser.
"""

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

import jwt

from app.core.config import Settings


class PushDeliveryError(RuntimeError):
    """Raised when an optional push provider cannot deliver a message."""

    def __init__(self, message: str, *, permanent: bool = False) -> None:
        super().__init__(message)
        self.permanent = permanent


class FirebasePushProvider:
    """Send one device notification through Firebase Cloud Messaging."""

    _scope = "https://www.googleapis.com/auth/firebase.messaging"
    _audience = "https://oauth2.googleapis.com/token"

    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def send(
        self,
        token: str,
        title: str,
        body: str,
        data: dict[str, str] | None = None,
    ) -> None:
        if not token:
            raise PushDeliveryError("Firebase device token is required")
        access_token = self._access_token()
        payload = json.dumps(
            {
                "message": {
                    "token": token,
                    "notification": {"title": title, "body": body},
                    "data": data or {},
                }
            },
            ensure_ascii=False,
        ).encode("utf-8")
        request = urllib.request.Request(
            self._send_url,
            data=payload,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json; charset=utf-8",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=10.0) as response:
                response.read()
        except urllib.error.HTTPError as error:
            raise PushDeliveryError(
                "Firebase push delivery failed",
                permanent=400 <= error.code < 500,
            ) from error
        except (OSError, urllib.error.URLError) as error:
            raise PushDeliveryError("Firebase push delivery failed") from error

    @property
    def _send_url(self) -> str:
        base_url = self.settings.firebase_api_base_url.rstrip("/")
        project_id = urllib.parse.quote(self.settings.firebase_project_id, safe="")
        return f"{base_url}/v1/projects/{project_id}/messages:send"

    def _access_token(self) -> str:
        now = int(time.time())
        claims = {
            "iss": self.settings.firebase_client_email,
            "scope": self._scope,
            "aud": self._audience,
            "iat": now,
            "exp": now + 3600,
        }
        private_key = self.settings.firebase_private_key.replace("\\n", "\n")
        try:
            assertion = jwt.encode(claims, private_key, algorithm="RS256")
            request = urllib.request.Request(
                self.settings.firebase_token_url,
                data=urllib.parse.urlencode(
                    {
                        "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
                        "assertion": assertion,
                    }
                ).encode("ascii"),
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                method="POST",
            )
            with urllib.request.urlopen(request, timeout=10.0) as response:
                token_payload: dict[str, Any] = json.loads(response.read())
        except (
            OSError,
            NotImplementedError,
            ValueError,
            TypeError,
            urllib.error.URLError,
            urllib.error.HTTPError,
        ) as error:
            raise PushDeliveryError("Firebase push authentication failed") from error
        access_token = token_payload.get("access_token")
        if not isinstance(access_token, str) or not access_token:
            raise PushDeliveryError("Firebase push authentication failed")
        return access_token
