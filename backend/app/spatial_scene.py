"""Validated spatial-card preprocessing provider boundary."""

from __future__ import annotations

import base64
import binascii
import hashlib
import json
from dataclasses import dataclass
from io import BytesIO
from typing import Any

import httpx
from PIL import Image, ImageEnhance, ImageOps, UnidentifiedImageError


class SpatialSceneProviderError(RuntimeError):
    """Stable, credential-safe failure raised by spatial scene providers."""


@dataclass(frozen=True)
class SpatialSceneBundle:
    depth: bytes
    mask: bytes
    background: bytes
    provider: str
    model_version: str
    confidence: float


@dataclass(frozen=True)
class PhotoAnalysisBundle:
    mask: bytes
    provider: str
    model_version: str
    confidence: float


SPATIAL_SCENE_TERMINAL_STATUSES = frozenset({"ready", "failed", "cancelled"})
SPATIAL_SCENE_STATUS_TRANSITIONS = {
    "queued": frozenset({"running", "cancelled"}),
    "running": frozenset({"validating", "retry_wait", "failed", "cancelled"}),
    "retry_wait": frozenset({"running", "cancelled"}),
    "validating": frozenset({"ready", "needs_review", "retry_wait", "failed"}),
    "needs_review": frozenset({"running", "cancelled"}),
    "ready": frozenset(),
    "failed": frozenset(),
    "cancelled": frozenset(),
}


def generation_key(
    *,
    source_revision: str,
    crop_rect: tuple[int, int, int, int],
    motion_preset: str,
    pipeline_version: str,
) -> str:
    """Return a stable owner-independent cache key for one exact input recipe."""
    canonical = json.dumps(
        {
            "sourceRevision": source_revision,
            "cropRect": crop_rect,
            "motionPreset": motion_preset,
            "pipelineVersion": pipeline_version,
        },
        separators=(",", ":"),
        sort_keys=True,
    ).encode()
    return hashlib.sha256(canonical).hexdigest()


def next_spatial_scene_status(current: str, requested: str) -> str:
    allowed = SPATIAL_SCENE_STATUS_TRANSITIONS.get(current)
    if allowed is None:
        raise ValueError(f"unknown spatial scene status: {current}")
    if requested not in allowed:
        if current in SPATIAL_SCENE_TERMINAL_STATUSES:
            raise ValueError("terminal spatial scene status cannot be mutated")
        raise ValueError(f"invalid spatial scene status transition: {current} -> {requested}")
    return requested


def _png_bytes(image: Image.Image) -> bytes:
    output = BytesIO()
    image.save(output, format="PNG", optimize=True)
    return output.getvalue()


def image_size(content: bytes) -> tuple[int, int]:
    try:
        with Image.open(BytesIO(content)) as image:
            image.verify()
        with Image.open(BytesIO(content)) as image:
            return image.size
    except (UnidentifiedImageError, OSError, ValueError) as error:
        raise SpatialSceneProviderError("spatial scene contains invalid image data") from error


def build_local_spatial_scene_bundle(content: bytes) -> SpatialSceneBundle:
    """Build a deterministic development bundle without claiming AI quality."""
    try:
        with Image.open(BytesIO(content)) as source:
            rgb = ImageOps.exif_transpose(source).convert("RGB")
            depth = ImageEnhance.Contrast(rgb.convert("L")).enhance(1.35)
            mask = Image.new("L", rgb.size, 255)
            return SpatialSceneBundle(
                depth=_png_bytes(depth),
                mask=_png_bytes(mask),
                background=_png_bytes(rgb),
                provider="local_fallback",
                model_version="luminance-v1",
                confidence=0.0,
            )
    except (UnidentifiedImageError, OSError, ValueError) as error:
        raise SpatialSceneProviderError("source asset is not a valid image") from error


def build_spatial_depth_bytes(content: bytes) -> bytes:
    """Compatibility wrapper for callers that still need only local depth."""
    return build_local_spatial_scene_bundle(content).depth


def validate_spatial_scene_bundle(
    bundle: SpatialSceneBundle, *, expected_size: tuple[int, int]
) -> SpatialSceneBundle:
    sizes = {
        image_size(bundle.depth),
        image_size(bundle.mask),
        image_size(bundle.background),
    }
    if sizes != {expected_size}:
        raise SpatialSceneProviderError("spatial scene derivative dimensions do not match source")
    if not bundle.provider.strip() or not bundle.model_version.strip():
        raise SpatialSceneProviderError("spatial scene provider identity is missing")
    if not 0.0 <= bundle.confidence <= 1.0:
        raise SpatialSceneProviderError("spatial scene confidence must be between zero and one")
    try:
        with Image.open(BytesIO(bundle.depth)) as depth_source:
            depth = _png_bytes(ImageOps.exif_transpose(depth_source).convert("L"))
        with Image.open(BytesIO(bundle.mask)) as mask_source:
            mask = _png_bytes(ImageOps.exif_transpose(mask_source).convert("L"))
        with Image.open(BytesIO(bundle.background)) as background_source:
            background = _png_bytes(ImageOps.exif_transpose(background_source).convert("RGB"))
    except (UnidentifiedImageError, OSError, ValueError) as error:
        raise SpatialSceneProviderError("spatial scene contains invalid image data") from error
    return SpatialSceneBundle(
        depth=depth,
        mask=mask,
        background=background,
        provider=bundle.provider,
        model_version=bundle.model_version,
        confidence=bundle.confidence,
    )


def validate_photo_analysis_bundle(
    bundle: PhotoAnalysisBundle, *, expected_size: tuple[int, int]
) -> PhotoAnalysisBundle:
    if not bundle.provider.strip() or not bundle.model_version.strip():
        raise SpatialSceneProviderError("photo analysis provider identity is missing")
    if bundle.provider == "local_fallback":
        raise SpatialSceneProviderError("photo analysis did not produce a valid subject mask")
    if not 0.0 <= bundle.confidence <= 1.0:
        raise SpatialSceneProviderError("photo analysis confidence must be between zero and one")
    try:
        with Image.open(BytesIO(bundle.mask)) as mask_source:
            mask_image = ImageOps.exif_transpose(mask_source).convert("L")
            if mask_image.size != expected_size:
                raise SpatialSceneProviderError(
                    "photo analysis mask dimensions do not match source"
                )
            extrema = mask_image.getextrema()
            if extrema is None or extrema == (255, 255):
                raise SpatialSceneProviderError(
                    "photo analysis did not produce a valid subject mask"
                )
            mask = _png_bytes(mask_image)
    except SpatialSceneProviderError:
        raise
    except (UnidentifiedImageError, OSError, ValueError) as error:
        raise SpatialSceneProviderError("photo analysis contains invalid mask data") from error
    return PhotoAnalysisBundle(
        mask=mask,
        provider=bundle.provider,
        model_version=bundle.model_version,
        confidence=bundle.confidence,
    )


def _decode_image_field(payload: dict[str, Any], key: str) -> bytes:
    value = payload.get(key)
    if not isinstance(value, str) or not value:
        raise SpatialSceneProviderError("AI spatial scene worker returned invalid response")
    try:
        return base64.b64decode(value, validate=True)
    except (binascii.Error, ValueError) as error:
        raise SpatialSceneProviderError(
            "AI spatial scene worker returned invalid response"
        ) from error


class HttpSpatialSceneProvider:
    """Private HTTP adapter for a separately hosted vision-model worker."""

    def __init__(
        self,
        *,
        url: str,
        token: str,
        timeout_seconds: float = 90.0,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.url = url
        self._token = token
        self.timeout_seconds = timeout_seconds
        self._transport = transport

    async def generate(self, content: bytes, *, mask: bytes | None = None) -> SpatialSceneBundle:
        expected_size = image_size(content)
        headers = {"X-Fanfolio-Scene-Version": "2"}
        if self._token:
            headers["Authorization"] = f"Bearer {self._token}"
        files: dict[str, tuple[str, bytes, str]] = {
            "image": ("source-image", content, "application/octet-stream")
        }
        if mask is not None:
            files["mask"] = ("photo-analysis-mask.png", mask, "image/png")
        try:
            async with httpx.AsyncClient(
                timeout=self.timeout_seconds, transport=self._transport
            ) as client:
                response = await client.post(
                    self.url,
                    headers=headers,
                    files=files,
                )
                response.raise_for_status()
                payload = response.json()
        except (httpx.HTTPError, ValueError) as error:
            raise SpatialSceneProviderError("AI spatial scene worker request failed") from error
        if not isinstance(payload, dict):
            raise SpatialSceneProviderError("AI spatial scene worker returned invalid response")
        try:
            provider = payload["provider"]
            model_version = payload["modelVersion"]
            confidence = float(payload["confidence"])
            if not isinstance(provider, str) or not isinstance(model_version, str):
                raise TypeError
        except (KeyError, TypeError, ValueError) as error:
            raise SpatialSceneProviderError(
                "AI spatial scene worker returned invalid response"
            ) from error
        bundle = SpatialSceneBundle(
            depth=_decode_image_field(payload, "depthBase64"),
            mask=_decode_image_field(payload, "maskBase64"),
            background=_decode_image_field(payload, "backgroundBase64"),
            provider=provider,
            model_version=model_version,
            confidence=confidence,
        )
        return validate_spatial_scene_bundle(bundle, expected_size=expected_size)


class HttpPhotoAnalysisProvider:
    """Private HTTP adapter for shared source-photo subject segmentation."""

    def __init__(
        self,
        *,
        generate_url: str,
        token: str,
        timeout_seconds: float = 90.0,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.url = self._analyze_url(generate_url)
        self._token = token
        self.timeout_seconds = timeout_seconds
        self._transport = transport

    @staticmethod
    def _analyze_url(generate_url: str) -> str:
        if generate_url.rstrip("/").endswith("/generate"):
            return f"{generate_url.rstrip('/')[: -len('/generate')]}/analyze"
        return f"{generate_url.rstrip('/')}/analyze"

    async def analyze(self, content: bytes) -> PhotoAnalysisBundle:
        expected_size = image_size(content)
        headers = {"X-Fanfolio-Photo-Analysis-Version": "1"}
        if self._token:
            headers["Authorization"] = f"Bearer {self._token}"
        try:
            async with httpx.AsyncClient(
                timeout=self.timeout_seconds, transport=self._transport
            ) as client:
                response = await client.post(
                    self.url,
                    headers=headers,
                    files={"image": ("source-image", content, "application/octet-stream")},
                )
                response.raise_for_status()
                payload = response.json()
        except (httpx.HTTPError, ValueError) as error:
            raise SpatialSceneProviderError("AI photo analysis worker request failed") from error
        if not isinstance(payload, dict):
            raise SpatialSceneProviderError("AI photo analysis worker returned invalid response")
        try:
            provider = payload["provider"]
            model_version = payload["modelVersion"]
            confidence = float(payload["confidence"])
            if not isinstance(provider, str) or not isinstance(model_version, str):
                raise TypeError
        except (KeyError, TypeError, ValueError) as error:
            raise SpatialSceneProviderError(
                "AI photo analysis worker returned invalid response"
            ) from error
        bundle = PhotoAnalysisBundle(
            mask=_decode_image_field(payload, "maskBase64"),
            provider=provider,
            model_version=model_version,
            confidence=confidence,
        )
        return validate_photo_analysis_bundle(bundle, expected_size=expected_size)


class LocalSpatialSceneProvider:
    async def generate(self, content: bytes, *, mask: bytes | None = None) -> SpatialSceneBundle:
        return build_local_spatial_scene_bundle(content)


def configured_spatial_scene_provider(
    settings: Any, *, transport: httpx.AsyncBaseTransport | None = None
) -> HttpSpatialSceneProvider | LocalSpatialSceneProvider:
    if settings.spatial_scene_provider == "local_fallback":
        return LocalSpatialSceneProvider()
    if settings.spatial_scene_provider == "http":
        if not settings.spatial_scene_ai_url:
            raise SpatialSceneProviderError("AI spatial scene worker URL is not configured")
        return HttpSpatialSceneProvider(
            url=settings.spatial_scene_ai_url,
            token=settings.spatial_scene_ai_token,
            timeout_seconds=settings.spatial_scene_ai_timeout_seconds,
            transport=transport,
        )
    raise SpatialSceneProviderError("unsupported spatial scene provider")


def configured_photo_analysis_provider(
    settings: Any, *, transport: httpx.AsyncBaseTransport | None = None
) -> HttpPhotoAnalysisProvider:
    if settings.spatial_scene_provider != "http" or not settings.spatial_scene_ai_url:
        raise SpatialSceneProviderError("AI photo analysis worker URL is not configured")
    return HttpPhotoAnalysisProvider(
        generate_url=settings.spatial_scene_ai_url,
        token=settings.spatial_scene_ai_token,
        timeout_seconds=settings.spatial_scene_ai_timeout_seconds,
        transport=transport,
    )


def source_revision(source_asset_id: str, uploaded_at: Any) -> str:
    return f"{source_asset_id}:{uploaded_at.isoformat()}"


def photo_analysis_metadata(
    source_asset_id: str,
    *,
    source_revision: str,
    provider: str,
    model_version: str,
    confidence: float,
    mask_storage_path: str,
) -> dict[str, object]:
    return {
        "version": 1,
        "status": "completed",
        "sourceAssetId": source_asset_id,
        "sourceRevision": source_revision,
        "provider": provider,
        "modelVersion": model_version,
        "confidence": confidence,
        "maskAssetId": f"{source_asset_id}-photo-analysis-mask",
        "maskUrl": f"/api/artist/assets/{source_asset_id}/photo-analysis-mask",
        "capabilities": {"subjectMask": True, "faceProtection": False},
        "maskStoragePath": mask_storage_path,
    }


def public_photo_analysis_metadata(metadata: dict[str, object]) -> dict[str, object]:
    return {
        key: value
        for key, value in metadata.items()
        if not key.endswith("StoragePath") and key != "maskAssetId"
    }


def spatial_scene_metadata(
    source_asset_id: str,
    *,
    provider: str = "ai_depth_estimator",
    model_version: str = "unknown",
    confidence: float = 0.0,
    source_revision: str | None = None,
    depth_storage_path: str | None = None,
    mask_storage_path: str | None = None,
    background_storage_path: str | None = None,
) -> dict[str, object]:
    metadata = {
        "version": 2,
        "sourceAssetId": source_asset_id,
        "provider": provider,
        "modelVersion": model_version,
        "confidence": confidence,
        "status": "completed",
        "depthAssetId": f"{source_asset_id}-spatial-depth",
        "maskAssetId": f"{source_asset_id}-spatial-mask",
        "backgroundAssetId": f"{source_asset_id}-spatial-background",
        "runtime": "webgl-layered",
        "maxYawDeg": 4.0,
        "maxPitchDeg": 3.0,
        "depthStoragePath": depth_storage_path,
        "maskStoragePath": mask_storage_path,
        "backgroundStoragePath": background_storage_path,
    }
    if source_revision is not None:
        metadata["sourceRevision"] = source_revision
    return metadata


def public_spatial_scene_metadata(metadata: dict[str, object]) -> dict[str, object]:
    return {key: value for key, value in metadata.items() if not key.endswith("StoragePath")}
