from __future__ import annotations

import base64
import hmac
import os
from typing import Annotated

from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from starlette.concurrency import run_in_threadpool

from spatial_worker.runtime import build_runtime_engine, build_segmentation_engine

app = FastAPI(title="Fanfolio Spatial Scene Worker")
MAX_IMAGE_BYTES = 10 * 1024 * 1024


def authorize(authorization: str | None) -> None:
    expected = os.environ.get("SPATIAL_SCENE_WORKER_TOKEN", "")
    if not expected:
        raise HTTPException(status_code=503, detail="worker token is not configured")
    supplied = authorization.removeprefix("Bearer ").strip() if authorization else ""
    if not hmac.compare_digest(supplied, expected):
        raise HTTPException(status_code=401, detail="invalid worker token")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


def _generate_scene(content: bytes, mask_content: bytes | None):
    return build_runtime_engine().generate(content, mask=mask_content)


def _analyze_photo(content: bytes):
    return build_segmentation_engine().analyze(content)


@app.post("/generate")
async def generate(
    image: Annotated[UploadFile, File()],
    mask: Annotated[UploadFile | None, File()] = None,
    authorization: Annotated[str | None, Header()] = None,
) -> dict[str, str | float]:
    authorize(authorization)
    content = await image.read(MAX_IMAGE_BYTES + 1)
    if len(content) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="source image is too large")
    mask_content = None
    if mask is not None:
        mask_content = await mask.read(MAX_IMAGE_BYTES + 1)
        if len(mask_content) > MAX_IMAGE_BYTES:
            raise HTTPException(status_code=413, detail="mask image is too large")
    try:
        result = await run_in_threadpool(_generate_scene, content, mask_content)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return {
        "provider": result.provider,
        "modelVersion": result.model_version,
        "confidence": result.confidence,
        "depthBase64": base64.b64encode(result.depth).decode("ascii"),
        "maskBase64": base64.b64encode(result.mask).decode("ascii"),
        "backgroundBase64": base64.b64encode(result.background).decode("ascii"),
    }


@app.post("/analyze")
async def analyze(
    image: Annotated[UploadFile, File()],
    authorization: Annotated[str | None, Header()] = None,
) -> dict[str, str | float]:
    authorize(authorization)
    content = await image.read(MAX_IMAGE_BYTES + 1)
    if len(content) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="source image is too large")
    try:
        result = await run_in_threadpool(_analyze_photo, content)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return {
        "provider": result.provider,
        "modelVersion": result.model_version,
        "confidence": result.confidence,
        "maskBase64": base64.b64encode(result.mask).decode("ascii"),
    }
