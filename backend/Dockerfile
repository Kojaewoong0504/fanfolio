FROM ghcr.io/astral-sh/uv:python3.11-bookworm-slim

WORKDIR /app

RUN groupadd --system fanfolio \
    && useradd --system --gid fanfolio --home-dir /app --create-home fanfolio \
    && mkdir -p /var/lib/fanfolio/storage \
    && chown -R fanfolio:fanfolio /var/lib/fanfolio

# Install only locked runtime dependencies before copying source so source-only
# edits can reuse the image layer in local development and CI.
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --locked --no-dev --no-install-project

COPY --chown=fanfolio:fanfolio backend/app ./app
COPY --chown=fanfolio:fanfolio backend/alembic ./alembic
COPY --chown=fanfolio:fanfolio backend/alembic.ini ./alembic.ini

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED="1" \
    APP_ENV="production" \
    AUTO_CREATE_SCHEMA="false"

USER fanfolio

EXPOSE 8000

CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
