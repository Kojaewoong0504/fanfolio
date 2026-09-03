import asyncio
import base64
from io import BytesIO

import httpx
import pytest
from PIL import Image

from app.core.config import Settings
from app.spatial_scene import (
    HttpPhotoAnalysisProvider,
    HttpSpatialSceneProvider,
    PhotoAnalysisBundle,
    SpatialSceneBundle,
    SpatialSceneProviderError,
    build_local_spatial_scene_bundle,
    configured_spatial_scene_provider,
    generation_key,
    next_spatial_scene_status,
    photo_analysis_metadata,
    public_photo_analysis_metadata,
    public_spatial_scene_metadata,
    spatial_scene_metadata,
    validate_photo_analysis_bundle,
    validate_spatial_scene_bundle,
)


def image_bytes(mode: str, size: tuple[int, int], color: int | tuple[int, ...]) -> bytes:
    image = Image.new(mode, size, color)
    image.save(buffer := BytesIO(), format="PNG")
    return buffer.getvalue()


def test_local_spatial_scene_bundle_is_explicit_development_fallback() -> None:
    source = image_bytes("RGB", (8, 10), (30, 40, 80))

    bundle = build_local_spatial_scene_bundle(source)

    assert bundle.provider == "local_fallback"
    assert Image.open(BytesIO(bundle.depth)).mode == "L"
    assert Image.open(BytesIO(bundle.mask)).getextrema() == (255, 255)
    assert Image.open(BytesIO(bundle.background)).size == (8, 10)


def test_validate_spatial_scene_bundle_rejects_misaligned_derivatives() -> None:
    bundle = SpatialSceneBundle(
        depth=image_bytes("L", (8, 10), 128),
        mask=image_bytes("L", (7, 10), 255),
        background=image_bytes("RGB", (8, 10), (30, 40, 80)),
        provider="test-ai",
        model_version="1",
        confidence=0.9,
    )

    with pytest.raises(SpatialSceneProviderError, match="dimensions"):
        validate_spatial_scene_bundle(bundle, expected_size=(8, 10))


def test_http_provider_decodes_validated_ai_bundle_without_leaking_token() -> None:
    payload = {
        "provider": "depth-anything-v2+sam2+lama",
        "modelVersion": "2026-09",
        "confidence": 0.93,
        "depthBase64": base64.b64encode(image_bytes("L", (8, 10), 120)).decode(),
        "maskBase64": base64.b64encode(image_bytes("L", (8, 10), 255)).decode(),
        "backgroundBase64": base64.b64encode(image_bytes("RGB", (8, 10), (10, 20, 30))).decode(),
    }

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["Authorization"] == "Bearer secret-worker-token"
        assert request.headers["X-Fanfolio-Scene-Version"] == "2"
        return httpx.Response(200, json=payload)

    provider = HttpSpatialSceneProvider(
        url="https://worker.internal/generate",
        token="secret-worker-token",
        transport=httpx.MockTransport(handler),
    )
    bundle = asyncio.run(provider.generate(image_bytes("RGB", (8, 10), (1, 2, 3))))

    assert bundle.provider == "depth-anything-v2+sam2+lama"
    assert bundle.model_version == "2026-09"
    assert bundle.confidence == 0.93
    assert "secret-worker-token" not in repr(bundle)


def test_http_spatial_provider_reuses_supplied_analysis_mask() -> None:
    mask = image_bytes("L", (8, 10), 120)
    payload = {
        "provider": "depth-anything-v2+cached-mask+telea",
        "modelVersion": "2026-09",
        "confidence": 0.91,
        "depthBase64": base64.b64encode(image_bytes("L", (8, 10), 130)).decode(),
        "maskBase64": base64.b64encode(mask).decode(),
        "backgroundBase64": base64.b64encode(image_bytes("RGB", (8, 10), (5, 6, 7))).decode(),
    }

    def handler(request: httpx.Request) -> httpx.Response:
        body = request.read()
        assert b'name="mask"' in body
        assert mask in body
        return httpx.Response(200, json=payload)

    provider = HttpSpatialSceneProvider(
        url="https://worker.internal/generate",
        token="secret-worker-token",
        transport=httpx.MockTransport(handler),
    )
    bundle = asyncio.run(provider.generate(image_bytes("RGB", (8, 10), (1, 2, 3)), mask=mask))

    assert bundle.provider == "depth-anything-v2+cached-mask+telea"
    assert Image.open(BytesIO(bundle.mask)).getextrema() == (120, 120)


def test_http_photo_analysis_provider_derives_analyze_url_from_generate_url() -> None:
    mask = image_bytes("L", (8, 10), 180)

    def handler(request: httpx.Request) -> httpx.Response:
        assert str(request.url) == "https://worker.internal/analyze"
        assert request.headers["Authorization"] == "Bearer secret-worker-token"
        return httpx.Response(
            200,
            json={
                "provider": "isnet",
                "modelVersion": "isnet-general-use",
                "confidence": 0.82,
                "maskBase64": base64.b64encode(mask).decode(),
            },
        )

    provider = HttpPhotoAnalysisProvider(
        generate_url="https://worker.internal/generate",
        token="secret-worker-token",
        transport=httpx.MockTransport(handler),
    )
    bundle = asyncio.run(provider.analyze(image_bytes("RGB", (8, 10), (1, 2, 3))))

    assert bundle.provider == "isnet"
    assert bundle.model_version == "isnet-general-use"
    assert bundle.confidence == 0.82
    assert Image.open(BytesIO(bundle.mask)).size == (8, 10)


def test_validate_photo_analysis_rejects_all_white_local_fallback_mask() -> None:
    bundle = PhotoAnalysisBundle(
        mask=image_bytes("L", (8, 10), 255),
        provider="local_fallback",
        model_version="luminance-v1",
        confidence=0.0,
    )

    with pytest.raises(SpatialSceneProviderError, match="valid subject mask"):
        validate_photo_analysis_bundle(bundle, expected_size=(8, 10))


def test_public_photo_analysis_metadata_exposes_studio_contract_without_storage_path() -> None:
    metadata = photo_analysis_metadata(
        "asset_card",
        source_revision="asset_card:2026-09-03T12:00:00+00:00",
        provider="isnet",
        model_version="isnet-general-use",
        confidence=0.82,
        mask_storage_path="s3://private/mask.png",
    )

    assert public_photo_analysis_metadata(metadata) == {
        "version": 1,
        "status": "completed",
        "sourceAssetId": "asset_card",
        "sourceRevision": "asset_card:2026-09-03T12:00:00+00:00",
        "provider": "isnet",
        "modelVersion": "isnet-general-use",
        "confidence": 0.82,
        "maskUrl": "/api/artist/assets/asset_card/photo-analysis-mask",
        "capabilities": {"subjectMask": True, "faceProtection": False},
    }


def test_http_provider_fails_closed_on_malformed_worker_response() -> None:
    provider = HttpSpatialSceneProvider(
        url="https://worker.internal/generate",
        token="secret",
        transport=httpx.MockTransport(lambda _: httpx.Response(200, json={"status": "ok"})),
    )

    with pytest.raises(SpatialSceneProviderError, match="invalid response"):
        asyncio.run(provider.generate(image_bytes("RGB", (8, 10), (1, 2, 3))))


def test_public_metadata_removes_every_private_storage_path() -> None:
    metadata = spatial_scene_metadata(
        "asset_card",
        provider="test-ai",
        model_version="1",
        confidence=0.88,
        depth_storage_path="s3://private/depth.png",
        mask_storage_path="s3://private/mask.png",
        background_storage_path="s3://private/background.webp",
    )

    assert public_spatial_scene_metadata(metadata) == {
        "version": 2,
        "sourceAssetId": "asset_card",
        "provider": "test-ai",
        "modelVersion": "1",
        "confidence": 0.88,
        "status": "completed",
        "depthAssetId": "asset_card-spatial-depth",
        "maskAssetId": "asset_card-spatial-mask",
        "backgroundAssetId": "asset_card-spatial-background",
        "runtime": "webgl-layered",
        "maxYawDeg": 4.0,
        "maxPitchDeg": 3.0,
    }


def test_configured_provider_requires_http_worker_url() -> None:
    settings = Settings(_env_file=None, spatial_scene_provider="http")

    with pytest.raises(SpatialSceneProviderError, match="URL is not configured"):
        configured_spatial_scene_provider(settings)


def test_configured_provider_uses_local_fallback_only_when_explicit() -> None:
    settings = Settings(_env_file=None, spatial_scene_provider="local_fallback")

    bundle = asyncio.run(
        configured_spatial_scene_provider(settings).generate(image_bytes("RGB", (8, 10), (1, 2, 3)))
    )

    assert bundle.provider == "local_fallback"


def test_generation_key_is_stable_for_retried_requests_and_changes_with_source() -> None:
    args = {
        "source_revision": "asset-r1",
        "crop_rect": (0, 0, 768, 1152),
        "motion_preset": "balanced",
        "pipeline_version": "3",
    }
    assert generation_key(**args) == generation_key(**args)
    assert generation_key(**args) != generation_key(**{**args, "source_revision": "asset-r2"})


def test_spatial_scene_status_transition_rejects_terminal_mutation() -> None:
    assert next_spatial_scene_status("queued", "running") == "running"
    assert next_spatial_scene_status("running", "validating") == "validating"
    assert next_spatial_scene_status("validating", "ready") == "ready"
    with pytest.raises(ValueError, match="terminal"):
        next_spatial_scene_status("ready", "running")
