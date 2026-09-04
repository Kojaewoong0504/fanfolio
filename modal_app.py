"""Modal deployment entry point for Fanfolio's private AI worker.

The HTTP payload is intentionally kept compatible with ``spatial_worker.app``
so the Render API can switch providers without exposing Modal credentials to
the browser.
"""

from pathlib import Path

import modal


ROOT = Path(__file__).parent
MODEL_DIR = "/models"

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("libglib2.0-0", "libgl1")
    .pip_install_from_requirements(str(ROOT / "spatial_worker" / "requirements.txt"))
    .env(
        {
            "TRANSFORMERS_CACHE": f"{MODEL_DIR}/transformers",
            "U2NET_HOME": f"{MODEL_DIR}/rembg",
            "SPATIAL_SEGMENTATION_MODEL": "u2netp",
            "OMP_NUM_THREADS": "1",
            "ORT_NUM_THREADS": "1",
        }
    )
    .run_commands(
        "python -c \"from transformers import pipeline; pipeline('depth-estimation', model='depth-anything/Depth-Anything-V2-Small-hf')\"",
        "python -c \"from rembg import new_session; new_session('u2netp')\"",
    )
    .add_local_python_source("spatial_worker")
)

app = modal.App("fanfolio-spatial-worker")
secret = modal.Secret.from_name("fanfolio-spatial-worker")


@app.function(
    image=image,
    secrets=[secret],
    cpu=2,
    memory=4096,
    timeout=120,
    scaledown_window=300,
    max_containers=1,
)
@modal.asgi_app()
def web():
    from spatial_worker.app import app as fastapi_app

    return fastapi_app
