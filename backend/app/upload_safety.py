"""Upload scanning boundary.

The local ``basic`` mode catches obvious executable prefixes without an
external service.  Production uses the ClamAV INSTREAM protocol and fails
closed if the scanner cannot be reached.  Keeping this adapter here means a
managed malware-scanning service can replace ClamAV without changing the
upload route contract.
"""

import asyncio
import struct

from app.core.config import get_settings
from app.errors import AppError

EXECUTABLE_SIGNATURES = (
    b"MZ",  # Windows PE executable
    b"\x7fELF",  # Linux/Unix executable
    b"#!",  # shell/script interpreter
    b"<?php",  # PHP script
    b"<script",  # browser script payload
)


def _reject_obvious_executable(content: bytes) -> None:
    normalized_head = content[:512].lstrip().lower()
    if any(
        content.startswith(signature) or normalized_head.startswith(signature.lower())
        for signature in EXECUTABLE_SIGNATURES
    ):
        raise AppError(422, "UNSAFE_UPLOAD", "안전하지 않은 파일 형식입니다.")


async def _scan_with_clamav(content: bytes) -> None:
    """Scan bytes using ClamAV's streaming TCP protocol.

    ClamAV expects ``zINSTREAM`` followed by big-endian length-prefixed
    chunks and a zero-length terminator.  A scanner error is intentionally
    surfaced as a 503 instead of allowing an unscanned upload through.
    """
    settings = get_settings()
    try:
        reader, writer = await asyncio.wait_for(
            asyncio.open_connection(settings.clamav_host, settings.clamav_port),
            timeout=settings.clamav_timeout_seconds,
        )
        writer.write(b"zINSTREAM\0")
        for offset in range(0, len(content), 1024 * 1024):
            chunk = content[offset : offset + 1024 * 1024]
            writer.write(struct.pack(">I", len(chunk)))
            writer.write(chunk)
        writer.write(struct.pack(">I", 0))
        await writer.drain()
        response = await asyncio.wait_for(
            reader.read(1024), timeout=settings.clamav_timeout_seconds
        )
        writer.close()
        await writer.wait_closed()
    except (TimeoutError, OSError) as error:
        raise AppError(
            503, "UPLOAD_SCAN_UNAVAILABLE", "파일 안전성 검사 서비스를 사용할 수 없습니다."
        ) from error

    normalized_response = response.lower()
    if b"found" in normalized_response:
        raise AppError(422, "MALWARE_DETECTED", "안전하지 않은 파일이 감지되었습니다.")
    if b"ok" not in normalized_response:
        raise AppError(
            503, "UPLOAD_SCAN_UNAVAILABLE", "파일 안전성 검사 결과를 확인할 수 없습니다."
        )


async def scan_uploaded_content(*, content_type: str, purpose: str, content: bytes) -> None:
    """Scan an upload before persistence; ``purpose`` is reserved for policy adapters."""
    del content_type, purpose
    mode = get_settings().asset_scan_mode
    if mode == "disabled":
        return

    _reject_obvious_executable(content)
    if mode == "clamav":
        await _scan_with_clamav(content)
