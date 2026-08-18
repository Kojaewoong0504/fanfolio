import asyncio
import struct
from io import BytesIO
from typing import Any

import pytest
from PIL import Image

from app import upload_safety
from app.errors import AppError


class FakeReader:
    def __init__(self, response: bytes) -> None:
        self.response = response

    async def read(self, _: int) -> bytes:
        return self.response


class FakeWriter:
    def __init__(self) -> None:
        self.writes: list[bytes] = []
        self.closed = False

    def write(self, value: bytes) -> None:
        self.writes.append(value)

    async def drain(self) -> None:
        return None

    def close(self) -> None:
        self.closed = True

    async def wait_closed(self) -> None:
        return None


def test_clamav_stream_uses_length_prefixed_chunks(monkeypatch: Any) -> None:
    reader = FakeReader(b"stream: OK\n")
    writer = FakeWriter()

    async def fake_open_connection(*_: Any) -> tuple[FakeReader, FakeWriter]:
        return reader, writer

    monkeypatch.setattr(upload_safety.asyncio, "open_connection", fake_open_connection)

    asyncio.run(upload_safety._scan_with_clamav(b"hello"))

    assert writer.writes[0] == b"zINSTREAM\0"
    assert writer.writes[1] == struct.pack(">I", 5)
    assert writer.writes[2] == b"hello"
    assert writer.writes[3] == struct.pack(">I", 0)
    assert writer.closed is True


def test_clamav_stream_rejects_detected_malware(monkeypatch: Any) -> None:
    async def fake_open_connection(*_: Any) -> tuple[FakeReader, FakeWriter]:
        return FakeReader(b"stream: Eicar-Test-Signature FOUND\n"), FakeWriter()

    monkeypatch.setattr(upload_safety.asyncio, "open_connection", fake_open_connection)

    with pytest.raises(AppError) as raised:
        asyncio.run(upload_safety._scan_with_clamav(b"bad"))

    assert raised.value.status_code == 422
    assert raised.value.code == "MALWARE_DETECTED"


def test_clamav_stream_fails_closed_when_connection_is_unavailable(monkeypatch: Any) -> None:
    async def unavailable(*_: Any) -> tuple[FakeReader, FakeWriter]:
        raise OSError("connection refused")

    monkeypatch.setattr(upload_safety.asyncio, "open_connection", unavailable)

    with pytest.raises(AppError) as raised:
        asyncio.run(upload_safety._scan_with_clamav(b"safe"))

    assert raised.value.status_code == 503
    assert raised.value.code == "UPLOAD_SCAN_UNAVAILABLE"


def test_event_banner_upload_rejects_bytes_that_are_not_an_image() -> None:
    with pytest.raises(AppError) as raised:
        asyncio.run(
            upload_safety.scan_uploaded_content(
                content_type="image/png",
                purpose="event_banner",
                content=b"event-banner",
            )
        )

    assert raised.value.status_code == 422
    assert raised.value.code == "INVALID_IMAGE"


def test_reward_image_upload_accepts_a_valid_square_png() -> None:
    buffer = BytesIO()
    Image.new("RGBA", (512, 512), (99, 86, 232, 255)).save(buffer, format="PNG")

    asyncio.run(
        upload_safety.scan_uploaded_content(
            content_type="image/png",
            purpose="reward_image",
            content=buffer.getvalue(),
        )
    )


def test_reward_image_upload_rejects_tiny_images() -> None:
    buffer = BytesIO()
    Image.new("RGBA", (64, 64), (99, 86, 232, 255)).save(buffer, format="PNG")

    with pytest.raises(AppError) as raised:
        asyncio.run(
            upload_safety.scan_uploaded_content(
                content_type="image/png",
                purpose="reward_image",
                content=buffer.getvalue(),
            )
        )

    assert raised.value.status_code == 422
    assert raised.value.code == "INVALID_IMAGE"
