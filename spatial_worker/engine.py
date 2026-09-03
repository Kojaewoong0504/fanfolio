from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from io import BytesIO

from PIL import Image, ImageOps, ImageStat, UnidentifiedImageError

ImageEstimator = Callable[[Image.Image], Image.Image]
BackgroundInpainter = Callable[[Image.Image, Image.Image], Image.Image]


@dataclass(frozen=True)
class SpatialWorkerResult:
    depth: bytes
    mask: bytes
    background: bytes
    provider: str
    model_version: str
    confidence: float


@dataclass(frozen=True)
class PhotoAnalysisResult:
    mask: bytes
    provider: str
    model_version: str
    confidence: float


def png(image: Image.Image) -> bytes:
    output = BytesIO()
    image.save(output, format="PNG", optimize=True)
    return output.getvalue()


def _pipeline_part(provider: str, index: int, fallback: str) -> str:
    parts = provider.split("+")
    if len(parts) > index and parts[index]:
        return parts[index]
    return fallback


def _cached_mask_provider(provider: str) -> str:
    parts = provider.split("+")
    if len(parts) >= 3:
        parts[1] = "cached-mask"
        return "+".join(parts)
    return f"{provider}+cached-mask"


class SpatialWorkerEngine:
    def __init__(
        self,
        *,
        depth_estimator: ImageEstimator,
        person_segmenter: ImageEstimator,
        background_inpainter: BackgroundInpainter,
        provider: str,
        model_version: str,
    ) -> None:
        self.depth_estimator = depth_estimator
        self.person_segmenter = person_segmenter
        self.background_inpainter = background_inpainter
        self.provider = provider
        self.model_version = model_version

    def _load_source(self, content: bytes) -> Image.Image:
        try:
            with Image.open(BytesIO(content)) as uploaded:
                return ImageOps.exif_transpose(uploaded).convert("RGB")
        except (UnidentifiedImageError, OSError, ValueError) as error:
            raise ValueError("source is not a valid image") from error

    def _load_mask(self, content: bytes, size: tuple[int, int]) -> Image.Image:
        try:
            with Image.open(BytesIO(content)) as uploaded:
                return ImageOps.exif_transpose(uploaded).convert("L").resize(
                    size, Image.Resampling.LANCZOS
                )
        except (UnidentifiedImageError, OSError, ValueError) as error:
            raise ValueError("mask is not a valid image") from error

    def analyze(self, content: bytes) -> PhotoAnalysisResult:
        source = self._load_source(content)
        mask = self.person_segmenter(source.copy()).convert("L").resize(
            source.size, Image.Resampling.LANCZOS
        )
        mask_mean = ImageStat.Stat(mask).mean[0] / 255.0
        coverage_score = 1.0 - min(1.0, abs(mask_mean - 0.42) / 0.58)
        return PhotoAnalysisResult(
            mask=png(mask),
            provider=_pipeline_part(self.provider, 1, "isnet"),
            model_version=self.model_version,
            confidence=round(max(0.0, min(1.0, coverage_score)), 4),
        )

    def generate(self, content: bytes, *, mask: bytes | None = None) -> SpatialWorkerResult:
        source = self._load_source(content)
        depth = self.depth_estimator(source.copy()).convert("L").resize(
            source.size, Image.Resampling.LANCZOS
        )
        mask_image = (
            self._load_mask(mask, source.size)
            if mask is not None
            else self.person_segmenter(source.copy()).convert("L").resize(
                source.size, Image.Resampling.LANCZOS
            )
        )
        background = self.background_inpainter(source.copy(), mask_image.copy()).convert("RGB").resize(
            source.size, Image.Resampling.LANCZOS
        )

        mask_mean = ImageStat.Stat(mask_image).mean[0] / 255.0
        depth_stddev = ImageStat.Stat(depth).stddev[0] / 64.0
        coverage_score = 1.0 - min(1.0, abs(mask_mean - 0.42) / 0.58)
        confidence = round(max(0.0, min(1.0, coverage_score * 0.65 + depth_stddev * 0.35)), 4)
        provider = _cached_mask_provider(self.provider) if mask is not None else self.provider
        return SpatialWorkerResult(
            depth=png(depth),
            mask=png(mask_image),
            background=png(background),
            provider=provider,
            model_version=self.model_version,
            confidence=confidence,
        )
