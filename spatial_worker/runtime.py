from __future__ import annotations

from functools import lru_cache
from io import BytesIO

from PIL import Image, ImageFilter

from spatial_worker.engine import SpatialWorkerEngine


@lru_cache(maxsize=1)
def build_segmentation_engine() -> SpatialWorkerEngine:
    """Load only the subject segmentation model for common photo analysis."""
    from rembg import new_session, remove

    removal_session = new_session("isnet-general-use")

    def segment_person(image: Image.Image) -> Image.Image:
        source = BytesIO()
        image.save(source, format="PNG")
        mask_bytes = remove(source.getvalue(), session=removal_session, only_mask=True)
        return Image.open(BytesIO(mask_bytes)).convert("L")

    return SpatialWorkerEngine(
        depth_estimator=lambda image: image.convert("L"),
        person_segmenter=segment_person,
        background_inpainter=lambda image, mask: image,
        provider="depth-anything-v2+isnet+telea",
        model_version="isnet-general-use",
    )


@lru_cache(maxsize=1)
def build_runtime_engine() -> SpatialWorkerEngine:
    """Load heavy depth and inpaint models only for spatial generation."""
    import cv2
    import numpy as np
    from transformers import pipeline

    depth_pipe = pipeline(
        task="depth-estimation",
        model="depth-anything/Depth-Anything-V2-Small-hf",
    )
    segmentation_engine = build_segmentation_engine()

    def estimate_depth(image: Image.Image) -> Image.Image:
        result = depth_pipe(image)
        return result["depth"]

    def inpaint_background(image: Image.Image, mask: Image.Image) -> Image.Image:
        expanded = mask.filter(ImageFilter.MaxFilter(15))
        rgb = np.asarray(image)
        bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
        mask_array = np.asarray(expanded)
        restored = cv2.inpaint(bgr, mask_array, 7, cv2.INPAINT_TELEA)
        return Image.fromarray(cv2.cvtColor(restored, cv2.COLOR_BGR2RGB))

    return SpatialWorkerEngine(
        depth_estimator=estimate_depth,
        person_segmenter=segmentation_engine.person_segmenter,
        background_inpainter=inpaint_background,
        provider="depth-anything-v2+isnet+telea",
        model_version="depth-anything-v2-small/isnet-general-use/telea-v1",
    )
