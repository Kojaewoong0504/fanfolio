import base64
from io import BytesIO
from types import SimpleNamespace

from fastapi.testclient import TestClient
from PIL import Image

from spatial_worker import app as worker_app


def png(image: Image.Image) -> bytes:
    image.save(buffer := BytesIO(), format="PNG")
    return buffer.getvalue()


def test_analyze_endpoint_uses_lightweight_segmentation_engine(monkeypatch) -> None:
    calls: list[str] = []
    mask = png(Image.new("L", (8, 10), 170))

    class FakeSegmentationEngine:
        def analyze(self, content: bytes) -> SimpleNamespace:
            calls.append("analyze")
            return SimpleNamespace(
                provider="isnet",
                model_version="isnet-general-use",
                confidence=0.72,
                mask=mask,
            )

    def fail_generation_engine():
        raise AssertionError("depth generation engine must not be loaded")

    monkeypatch.setenv("SPATIAL_SCENE_WORKER_TOKEN", "secret")
    monkeypatch.setattr(worker_app, "build_segmentation_engine", lambda: FakeSegmentationEngine())
    monkeypatch.setattr(worker_app, "build_runtime_engine", fail_generation_engine)

    response = TestClient(worker_app.app).post(
        "/analyze",
        headers={"Authorization": "Bearer secret"},
        files={"image": ("source.png", png(Image.new("RGB", (8, 10), (1, 2, 3))), "image/png")},
    )

    assert response.status_code == 200, response.text
    assert calls == ["analyze"]
    data = response.json()
    assert data["provider"] == "isnet"
    assert data["modelVersion"] == "isnet-general-use"
    assert data["confidence"] == 0.72
    assert base64.b64decode(data["maskBase64"]) == mask


def test_generate_endpoint_forwards_supplied_mask(monkeypatch) -> None:
    calls: list[bytes | None] = []
    source = png(Image.new("RGB", (8, 10), (1, 2, 3)))
    mask = png(Image.new("L", (8, 10), 170))

    class FakeRuntimeEngine:
        def generate(self, content: bytes, mask: bytes | None = None) -> SimpleNamespace:
            calls.append(mask)
            return SimpleNamespace(
                provider="depth-anything-v2+cached-mask+telea",
                model_version="test-v1",
                confidence=0.8,
                depth=png(Image.new("L", (8, 10), 100)),
                mask=mask,
                background=source,
            )

    monkeypatch.setenv("SPATIAL_SCENE_WORKER_TOKEN", "secret")
    monkeypatch.setattr(worker_app, "build_runtime_engine", lambda: FakeRuntimeEngine())

    response = TestClient(worker_app.app).post(
        "/generate",
        headers={"Authorization": "Bearer secret"},
        files={
            "image": ("source.png", source, "image/png"),
            "mask": ("mask.png", mask, "image/png"),
        },
    )

    assert response.status_code == 200, response.text
    assert calls == [mask]
    assert response.json()["provider"] == "depth-anything-v2+cached-mask+telea"


def test_analyze_endpoint_builds_engine_inside_threadpool(monkeypatch) -> None:
    source = png(Image.new("RGB", (8, 10), (1, 2, 3)))
    mask = png(Image.new("L", (8, 10), 170))
    inside_threadpool = False

    class FakeSegmentationEngine:
        def analyze(self, content: bytes) -> SimpleNamespace:
            return SimpleNamespace(
                provider="isnet",
                model_version="isnet-general-use",
                confidence=0.72,
                mask=mask,
            )

    async def fake_run_in_threadpool(func, *args, **kwargs):
        nonlocal inside_threadpool
        inside_threadpool = True
        try:
            return func(*args, **kwargs)
        finally:
            inside_threadpool = False

    def build_engine() -> FakeSegmentationEngine:
        assert inside_threadpool
        return FakeSegmentationEngine()

    monkeypatch.setenv("SPATIAL_SCENE_WORKER_TOKEN", "secret")
    monkeypatch.setattr(worker_app, "run_in_threadpool", fake_run_in_threadpool)
    monkeypatch.setattr(worker_app, "build_segmentation_engine", build_engine)

    response = TestClient(worker_app.app).post(
        "/analyze",
        headers={"Authorization": "Bearer secret"},
        files={"image": ("source.png", source, "image/png")},
    )

    assert response.status_code == 200, response.text


def test_generate_endpoint_builds_engine_inside_threadpool(monkeypatch) -> None:
    source = png(Image.new("RGB", (8, 10), (1, 2, 3)))
    mask = png(Image.new("L", (8, 10), 170))
    inside_threadpool = False

    class FakeRuntimeEngine:
        def generate(self, content: bytes, mask: bytes | None = None) -> SimpleNamespace:
            return SimpleNamespace(
                provider="depth-anything-v2+cached-mask+telea",
                model_version="test-v1",
                confidence=0.8,
                depth=png(Image.new("L", (8, 10), 100)),
                mask=mask,
                background=source,
            )

    async def fake_run_in_threadpool(func, *args, **kwargs):
        nonlocal inside_threadpool
        inside_threadpool = True
        try:
            return func(*args, **kwargs)
        finally:
            inside_threadpool = False

    def build_engine() -> FakeRuntimeEngine:
        assert inside_threadpool
        return FakeRuntimeEngine()

    monkeypatch.setenv("SPATIAL_SCENE_WORKER_TOKEN", "secret")
    monkeypatch.setattr(worker_app, "run_in_threadpool", fake_run_in_threadpool)
    monkeypatch.setattr(worker_app, "build_runtime_engine", build_engine)

    response = TestClient(worker_app.app).post(
        "/generate",
        headers={"Authorization": "Bearer secret"},
        files={
            "image": ("source.png", source, "image/png"),
            "mask": ("mask.png", mask, "image/png"),
        },
    )

    assert response.status_code == 200, response.text
