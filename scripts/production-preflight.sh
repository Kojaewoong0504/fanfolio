#!/usr/bin/env bash

# Validate production settings without starting the API or mutating the database.

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON="${PYTHON:-$ROOT_DIR/backend/.venv/bin/python}"

if [[ ! -x "$PYTHON" ]]; then
  echo "Backend Python environment not found: $PYTHON" >&2
  exit 1
fi

APP_ENV="${APP_ENV:-production}" \
  PYTHONPATH="$ROOT_DIR/backend" \
  "$PYTHON" - <<'PY'
from app.core.config import get_settings
from app.main import app

settings = get_settings()
settings.validate_runtime()

test_routes = [
    route_path
    for route in app.routes
    if (route_path := getattr(route, "path", "")).startswith("/api/test")
]
if test_routes:
    raise SystemExit(f"test-only routes are enabled in production: {test_routes}")

print("Production settings passed")
print(f"- frontend: {settings.frontend_url}")
print(f"- allowed origins: {', '.join(settings.allowed_origins)}")
print(f"- mail delivery: {settings.mail_delivery_mode}")
print(f"- storage backend: {settings.storage_backend}")
print(f"- upload scanner: {settings.asset_scan_mode}")
print(f"- auto schema creation: {'enabled' if settings.auto_create_schema else 'disabled'}")
print("- test-only routes: disabled")
PY
