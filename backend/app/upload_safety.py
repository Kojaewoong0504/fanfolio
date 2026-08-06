"""Small upload-safety boundary used before bytes are persisted.

This is intentionally an adapter boundary rather than a claim that a few
magic-byte checks are a complete malware scanner.  Local development uses
the cheap ``basic`` mode.  Production must keep scanning enabled, and a
future ClamAV/object-storage adapter can replace this function without
changing the upload route contract.
"""

from app.core.config import get_settings
from app.errors import AppError

# Common signatures for executable or script payloads that should never be
# accepted for Fanfolio's image/audio/document upload purposes.
EXECUTABLE_SIGNATURES = (
    b"MZ",  # Windows PE executable
    b"\x7fELF",  # Linux/Unix executable
    b"#!",  # shell/script interpreter
    b"<?php",  # PHP script
    b"<script",  # browser script payload
)


def scan_uploaded_content(*, content_type: str, purpose: str, content: bytes) -> None:
    """Reject obviously executable uploads before they reach storage.

    ``disabled`` is useful only for isolated local debugging.  Production
    startup rejects it in ``Settings.validate_runtime``.  The scanner uses
    both the raw prefix and a whitespace-trimmed, case-insensitive prefix so
    a text script with a leading newline is still caught.
    """
    if get_settings().asset_scan_mode == "disabled":
        return

    normalized_head = content[:512].lstrip().lower()
    if any(
        content.startswith(signature) or normalized_head.startswith(signature.lower())
        for signature in EXECUTABLE_SIGNATURES
    ):
        raise AppError(422, "UNSAFE_UPLOAD", "안전하지 않은 파일 형식입니다.")
