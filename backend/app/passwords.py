"""Password hashing helpers for private artist-studio accounts.

`hashlib.scrypt` is part of Python's standard library and is deliberately used
here instead of storing provisioned passwords or adding a second auth stack.
Each password gets a fresh salt; only the encoded hash is persisted.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets

_N = 2**14
_R = 8
_P = 1
_KEY_BYTES = 32


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=_N, r=_R, p=_P, dklen=_KEY_BYTES)
    encode = lambda value: base64.urlsafe_b64encode(value).decode("ascii")
    return f"scrypt${_N}${_R}${_P}${encode(salt)}${encode(digest)}"


def verify_password(password: str, encoded: str | None) -> bool:
    try:
        algorithm, n, r, p, salt_text, digest_text = (encoded or "").split("$", 5)
        if algorithm != "scrypt":
            return False
        salt = base64.urlsafe_b64decode(salt_text.encode("ascii"))
        expected = base64.urlsafe_b64decode(digest_text.encode("ascii"))
        actual = hashlib.scrypt(
            password.encode("utf-8"),
            salt=salt,
            n=int(n),
            r=int(r),
            p=int(p),
            dklen=len(expected),
        )
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False
