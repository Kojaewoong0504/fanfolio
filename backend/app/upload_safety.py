"""Upload scanning boundary.

The local ``basic`` mode catches obvious executable prefixes without an
external service.  Production uses the ClamAV INSTREAM protocol and fails
closed if the scanner cannot be reached.  Keeping this adapter here means a
managed malware-scanning service can replace ClamAV without changing the
upload route contract.
"""

import asyncio
import struct
from io import BytesIO

from PIL import Image, UnidentifiedImageError

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
    mode = get_settings().asset_scan_mode
    if mode == "disabled":
        return

    if purpose in {"event_banner", "reward_image"} and content_type in {
        "image/png",
        "image/jpeg",
        "image/webp",
    }:
        try:
            with Image.open(BytesIO(content)) as image:
                if purpose == "event_banner" and (image.width < 320 or image.height < 160):
                    raise AppError(
                        422,
                        "INVALID_IMAGE",
                        "이벤트 배너는 가로 320px, 세로 160px 이상이어야 합니다.",
                    )
                if purpose == "reward_image" and (image.width < 128 or image.height < 128):
                    raise AppError(
                        422,
                        "INVALID_IMAGE",
                        "보상 이미지는 가로와 세로가 각각 128px 이상이어야 합니다.",
                    )
                image.verify()
        except (UnidentifiedImageError, OSError) as error:
            raise AppError(422, "INVALID_IMAGE", "이미지 파일을 읽을 수 없습니다.") from error

    _reject_obvious_executable(content)
    if mode == "clamav":
        await _scan_with_clamav(content)
