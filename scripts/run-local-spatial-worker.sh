#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON_BIN="${PYTHON_BIN:-python3}"
VENV_DIR="${SPATIAL_WORKER_VENV:-$ROOT_DIR/.venv-spatial-worker}"

if [[ ! -x "$VENV_DIR/bin/python" ]]; then
  "$PYTHON_BIN" -m venv "$VENV_DIR"
fi

if [[ ! -f "$VENV_DIR/.requirements-installed" || "$ROOT_DIR/spatial_worker/requirements.txt" -nt "$VENV_DIR/.requirements-installed" ]]; then
  "$VENV_DIR/bin/python" -m pip install -r "$ROOT_DIR/spatial_worker/requirements.txt"
  touch "$VENV_DIR/.requirements-installed"
fi

export PYTHONPATH="$ROOT_DIR${PYTHONPATH:+:$PYTHONPATH}"
export SPATIAL_SCENE_WORKER_TOKEN="${SPATIAL_SCENE_WORKER_TOKEN:-local-spatial-worker-token}"

exec "$VENV_DIR/bin/uvicorn" spatial_worker.app:app \
  --host "${SPATIAL_WORKER_HOST:-127.0.0.1}" \
  --port "${SPATIAL_WORKER_PORT:-8080}" \
  --workers 1
