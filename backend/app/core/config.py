import os
import re
from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def default_database_url() -> str:
    """Keep the development SQLite file stable regardless of process cwd."""
    database_path = Path(__file__).resolve().parents[2] / "fanfolio.db"
    return f"sqlite+aiosqlite:///{database_path}"


class Settings(BaseSettings):
    """Pydantic v2 settings: environment variables are parsed and typed once."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    app_env: str = "development"
    database_url: str = Field(default_factory=default_database_url)
    # Supabase's transaction pooler requires asyncpg's prepared-statement
    # cache to be disabled. Keep this configurable for direct Postgres too.
    database_statement_cache_size: int = 100
    # Optional least-privilege role used by the API against PostgreSQL. Leave
    # empty for local SQLite and installations that manage grants externally.
    database_app_role: str = ""
    point_reconciliation_interval_seconds: int = 300
    auto_create_schema: bool = True
    seed_demo_catalog: bool = False
    # Local-only credentials used to inspect the artist studio without an
    # admin password-reset round trip after every development restart.
    local_artist_studio_username: str = "local-artist-studio"
    local_artist_studio_password: str = "local-artist-password-2026"
    local_artist_studio_artist_id: str = "artist_nova3"
    # Local-only credentials used to log into the admin console during browser
    # verification. Hosted environments continue using ADMIN_BOOTSTRAP_*.
    local_admin_email: str = "local-admin@example.com"
    local_admin_password: str = "local-admin-password-2026"
    repair_demo_card_assets: bool = False
    storage_dir: str = "./storage"
    storage_backend: str = "local"
    r2_account_id: str = ""
    r2_bucket: str = ""
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    s3_endpoint_url: str = ""
    s3_region: str = "ap-northeast-2"
    s3_bucket: str = ""
    s3_key_prefix: str = "fanfolio"
    s3_access_key_id: str = ""
    s3_secret_access_key: str = ""
    max_upload_bytes: int = 10 * 1024 * 1024
    upload_url_ttl_seconds: int = 15 * 60
    asset_scan_mode: str = "basic"
    clamav_host: str = "localhost"
    clamav_port: int = 3310
    clamav_timeout_seconds: float = 5.0
    download_signing_secret: str = "dev-only-change-me"
    download_url_ttl_seconds: int = 5 * 60
    frontend_origins: str = (
        "http://localhost:4174,http://localhost:4175,http://localhost:5173,"
        "http://127.0.0.1:4174,http://127.0.0.1:4175,http://127.0.0.1:5173"
    )
    frontend_preview_projects: str = ""
    frontend_preview_domain: str = ""
    frontend_url: str = "http://localhost:5173"
    admin_bootstrap_email: str = ""
    admin_bootstrap_password: str = ""
    # Sandbox point issuance is opt-in for hosted QA only and never enabled in production.
    allow_sandbox_point_charges: bool = False
    data_protection_key: str = ""
    allow_data_bootstrap: bool = False
    mail_delivery_mode: str = "console"
    mail_from: str = "Fanfolio <no-reply@localhost>"
    resend_api_key: str = ""
    resend_base_url: str = "https://api.resend.com"
    push_delivery_mode: str = "console"
    firebase_project_id: str = ""
    firebase_client_email: str = ""
    firebase_private_key: str = ""
    firebase_token_url: str = "https://oauth2.googleapis.com/token"
    firebase_api_base_url: str = "https://fcm.googleapis.com"
    jwt_access_secret: str = "dev-access-secret-change-me-32-bytes"
    jwt_refresh_secret: str = "dev-refresh-secret-change-me-32-bytes"
    jwt_issuer: str = "fanfolio"
    jwt_audience: str = "fanfolio-api"
    jwt_access_ttl_seconds: int = 600
    jwt_refresh_ttl_seconds: int = 60 * 60 * 24 * 30
    oauth_frontend_callback_url: str = "http://localhost:5173/oauth/callback"
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8000/api/auth/oauth/google/callback"
    kakao_client_id: str = ""
    kakao_client_secret: str = ""
    kakao_redirect_uri: str = "http://localhost:8000/api/auth/oauth/kakao/callback"
    oauth_state_ttl_seconds: int = 600
    oauth_exchange_code_ttl_seconds: int = 60
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_use_tls: bool = True
    task_queue_mode: str = "inline"
    spatial_scene_provider: str = "local_fallback"
    spatial_scene_ai_url: str = ""
    spatial_scene_ai_token: str = ""
    spatial_scene_ai_timeout_seconds: float = 90.0
    engagement_event_max_attempts: int = 5
    engagement_event_retry_base_seconds: int = 30
    engagement_event_retry_max_seconds: int = 3600
    upload_cleanup_interval_seconds: int = 15 * 60
    celery_broker_url: str = "redis://localhost:6379/0"
    celery_result_backend: str = "redis://localhost:6379/0"
    rate_limit_backend: str = "memory"
    rate_limit_redis_url: str = "redis://localhost:6379/1"

    def __init__(self, **values: object) -> None:
        # Local integration credentials must never leak into the isolated test
        # runtime. Explicit env files (used by production-template tests) are
        # still honored, while normal test Settings instances use defaults.
        if "_env_file" not in values and os.getenv("APP_ENV") == "test":
            values["_env_file"] = None
        super().__init__(**values)

    @property
    def allowed_origins(self) -> list[str]:
        """Parse the comma-separated browser origins used by CORS."""
        return [origin.strip() for origin in self.frontend_origins.split(",") if origin.strip()]

    @property
    def allowed_preview_projects(self) -> list[str]:
        """Return project slugs that may create trusted Vercel preview origins."""
        return [
            project.strip()
            for project in self.frontend_preview_projects.split(",")
            if project.strip()
        ]

    @property
    def allowed_origin_regex(self) -> str | None:
        """Build a narrowly scoped preview regex from validated names.

        Operators configure project and team names instead of writing a raw
        regular expression. This avoids accidentally opening credentialed
        CORS to arbitrary origins while still supporting ephemeral previews.
        """
        projects = self.allowed_preview_projects
        domain = self.frontend_preview_domain.strip()
        if not projects or not domain:
            return None
        project_pattern = "|".join(re.escape(project) for project in projects)
        return (
            rf"^https://(?:{project_pattern})(?:-[a-z0-9-]+)?-"
            rf"{re.escape(domain)}$"
        )

    def is_origin_allowed(self, origin: str) -> bool:
        """Apply the same allow rule to CORS and CSRF origin validation."""
        if origin in self.allowed_origins:
            return True
        pattern = self.allowed_origin_regex
        return bool(pattern and re.fullmatch(pattern, origin))

    @property
    def async_database_url(self) -> str:
        """Return a URL compatible with SQLAlchemy's async engine.

        Older local setups often use ``sqlite:///...``.  It is a valid
        synchronous SQLAlchemy URL, but ``create_async_engine`` needs the
        async driver name to be explicit.  Keeping this normalization here
        makes the migration path visible without breaking an existing .env.
        """
        if self.database_url.startswith("sqlite:///"):
            return self.database_url.replace("sqlite:///", "sqlite+aiosqlite:///", 1)
        if self.database_url.startswith("postgres://"):
            return self.database_url.replace("postgres://", "postgresql+asyncpg://", 1)
        if self.database_url.startswith("postgresql://"):
            return self.database_url.replace("postgresql://", "postgresql+asyncpg://", 1)
        return self.database_url

    @property
    def database_backend(self) -> str:
        """Return only the driver name for safe startup diagnostics."""
        return self.async_database_url.split("://", 1)[0]

    @property
    def database_connect_args(self) -> dict[str, int]:
        """Return asyncpg-only connection options without exposing credentials."""
        if self.database_backend == "sqlite+aiosqlite":
            return {"timeout": 30}
        if self.database_backend != "postgresql+asyncpg":
            return {}
        return {"statement_cache_size": self.database_statement_cache_size}

    @property
    def is_hosted(self) -> bool:
        """Use browser-safe auth rules in both staging and production."""
        return self.app_env in {"staging", "production"}

    @property
    def object_storage_endpoint(self) -> str:
        """Return the configured R2 endpoint, with legacy S3 fallback."""
        if self.storage_backend == "r2" and self.r2_account_id:
            return f"https://{self.r2_account_id}.r2.cloudflarestorage.com"
        return self.s3_endpoint_url

    @property
    def object_storage_bucket(self) -> str:
        """Return the bucket name without exposing provider-specific details."""
        return self.r2_bucket or self.s3_bucket

    @property
    def object_storage_access_key(self) -> str:
        """Return the active object-storage access key, preferring R2 names."""
        return self.r2_access_key_id or self.s3_access_key_id

    @property
    def object_storage_secret_key(self) -> str:
        """Return the active object-storage secret, preferring R2 names."""
        return self.r2_secret_access_key or self.s3_secret_access_key

    def validate_runtime(self) -> None:
        """Fail fast when a production process would start with unsafe defaults."""
        if self.storage_backend not in {"local", "r2", "s3", "supabase"}:
            raise ValueError("STORAGE_BACKEND must be local, r2, s3, or supabase")
        if self.app_env == "production" and self.allow_sandbox_point_charges:
            raise ValueError("ALLOW_SANDBOX_POINT_CHARGES must be false in production")
        if self.database_statement_cache_size < 0:
            raise ValueError("DATABASE_STATEMENT_CACHE_SIZE cannot be negative")
        if self.storage_backend == "r2" and not self.object_storage_bucket:
            raise ValueError("R2_BUCKET is required for Cloudflare R2 storage")
        if self.storage_backend in {"s3", "supabase"} and not self.s3_bucket:
            raise ValueError("S3_BUCKET is required for remote storage backends")
        if self.storage_backend == "r2":
            if not self.object_storage_endpoint:
                raise ValueError("R2_ACCOUNT_ID or S3_ENDPOINT_URL is required for Cloudflare R2")
            if not self.object_storage_access_key or not self.object_storage_secret_key:
                raise ValueError(
                    "R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY are required for Cloudflare R2"
                )
        if self.storage_backend == "supabase":
            if not self.s3_endpoint_url.endswith("/storage/v1/s3"):
                raise ValueError("S3_ENDPOINT_URL must be the Supabase Storage S3 endpoint")
            if not self.s3_access_key_id or not self.s3_secret_access_key:
                raise ValueError(
                    "S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are required for Supabase Storage"
                )
        if self.upload_cleanup_interval_seconds <= 0:
            raise ValueError("UPLOAD_CLEANUP_INTERVAL_SECONDS must be positive")
        if self.push_delivery_mode not in {"console", "fcm"}:
            raise ValueError("PUSH_DELIVERY_MODE must be console or fcm")
        if self.spatial_scene_provider not in {"local_fallback", "http", "modal"}:
            raise ValueError("SPATIAL_SCENE_PROVIDER must be local_fallback, http, or modal")
        if self.spatial_scene_provider in {"http", "modal"} and not self.spatial_scene_ai_url:
            raise ValueError("SPATIAL_SCENE_AI_URL is required for the remote provider")
        if self.spatial_scene_ai_timeout_seconds <= 0:
            raise ValueError("SPATIAL_SCENE_AI_TIMEOUT_SECONDS must be positive")
        if self.push_delivery_mode == "fcm":
            missing = [
                name
                for name, value in (
                    ("FIREBASE_PROJECT_ID", self.firebase_project_id),
                    ("FIREBASE_CLIENT_EMAIL", self.firebase_client_email),
                    ("FIREBASE_PRIVATE_KEY", self.firebase_private_key),
                )
                if not value
            ]
            if missing:
                raise ValueError(f"{' and '.join(missing)} are required for FCM push delivery")
        if not self.is_hosted:
            return
        if len(self.data_protection_key) < 32:
            raise ValueError("DATA_PROTECTION_KEY must be at least 32 characters in production")
        if not self.async_database_url.startswith("postgresql+asyncpg://"):
            raise ValueError("DATABASE_URL must use durable PostgreSQL storage in production")
        if self.auto_create_schema:
            raise ValueError("AUTO_CREATE_SCHEMA must be false in production; run Alembic first")
        if not self.frontend_url.startswith("https://"):
            raise ValueError("FRONTEND_URL must use HTTPS in production")
        if not self.allowed_origins:
            raise ValueError("FRONTEND_ORIGINS must contain at least one origin")
        if "*" in self.allowed_origins:
            raise ValueError("FRONTEND_ORIGINS cannot use a wildcard in production")
        if any(not origin.startswith("https://") for origin in self.allowed_origins):
            raise ValueError("FRONTEND_ORIGINS must use HTTPS in production")
        preview_projects = self.allowed_preview_projects
        preview_domain = self.frontend_preview_domain.strip()
        if bool(preview_projects) != bool(preview_domain):
            raise ValueError(
                "FRONTEND_PREVIEW_PROJECTS and FRONTEND_PREVIEW_DOMAIN must be set together"
            )
        if preview_domain:
            if not preview_domain.endswith(".vercel.app") or not re.fullmatch(
                r"[a-z0-9-]+(?:\.[a-z0-9-]+)+", preview_domain
            ):
                raise ValueError("FRONTEND_PREVIEW_DOMAIN must be a Vercel team domain")
            if any(not re.fullmatch(r"[a-z0-9-]+", project) for project in preview_projects):
                raise ValueError("FRONTEND_PREVIEW_PROJECTS must contain Vercel project slugs")
        if self.app_env == "staging":
            # Staging still enforces durable identity, HTTPS, explicit schema
            # migration, and strong token secrets. SMTP, Redis, ClamAV, and
            # object storage remain production launch gates.
            self._validate_hosted_auth_secrets()
            return
        if self.mail_delivery_mode not in {"smtp", "resend"}:
            raise ValueError("MAIL_DELIVERY_MODE must be smtp or resend in production")
        if self.mail_delivery_mode == "smtp" and not self.smtp_host:
            raise ValueError("SMTP_HOST is required when MAIL_DELIVERY_MODE is smtp")
        if self.mail_delivery_mode == "resend" and not self.resend_api_key:
            raise ValueError("RESEND_API_KEY is required when MAIL_DELIVERY_MODE is resend")
        if not self.mail_from or "localhost" in self.mail_from:
            raise ValueError("MAIL_FROM must use a verified sender in production")
        if self.rate_limit_backend != "redis":
            raise ValueError("RATE_LIMIT_BACKEND must be redis in production")
        if not self.rate_limit_redis_url:
            raise ValueError("RATE_LIMIT_REDIS_URL is required in production")
        if self.download_signing_secret == "dev-only-change-me":
            raise ValueError("DOWNLOAD_SIGNING_SECRET must be changed in production")
        if self.jwt_access_secret == "dev-access-secret-change-me-32-bytes":
            raise ValueError("JWT_ACCESS_SECRET must be changed in production")
        if self.jwt_refresh_secret == "dev-refresh-secret-change-me-32-bytes":
            raise ValueError("JWT_REFRESH_SECRET must be changed in production")
        if self.jwt_access_ttl_seconds <= 0 or self.jwt_refresh_ttl_seconds <= 0:
            raise ValueError("JWT token TTLs must be positive")
        if self.asset_scan_mode != "clamav":
            raise ValueError("ASSET_SCAN_MODE must be clamav in production")
        if not self.clamav_host:
            raise ValueError("CLAMAV_HOST is required when ASSET_SCAN_MODE is clamav")
        self._validate_oauth_redirects()
        if self.storage_backend == "local":
            raise ValueError(
                "STORAGE_BACKEND=local is not allowed in production; use remote object storage"
            )

    def _validate_hosted_auth_secrets(self) -> None:
        if self.download_signing_secret == "dev-only-change-me":
            raise ValueError("DOWNLOAD_SIGNING_SECRET must be changed in hosted environments")
        if self.jwt_access_secret == "dev-access-secret-change-me-32-bytes":
            raise ValueError("JWT_ACCESS_SECRET must be changed in hosted environments")
        if self.jwt_refresh_secret == "dev-refresh-secret-change-me-32-bytes":
            raise ValueError("JWT_REFRESH_SECRET must be changed in hosted environments")
        if self.jwt_access_ttl_seconds <= 0 or self.jwt_refresh_ttl_seconds <= 0:
            raise ValueError("JWT token TTLs must be positive")
        self._validate_oauth_redirects()

    def _validate_oauth_redirects(self) -> None:
        if not self.oauth_frontend_callback_url.startswith("https://"):
            raise ValueError("OAUTH_FRONTEND_CALLBACK_URL must use HTTPS in production")
        if self.google_redirect_uri and not self.google_redirect_uri.startswith("https://"):
            raise ValueError("GOOGLE_REDIRECT_URI must use HTTPS in production")
        if self.kakao_redirect_uri and not self.kakao_redirect_uri.startswith("https://"):
            raise ValueError("KAKAO_REDIRECT_URI must use HTTPS in production")


@lru_cache
def get_settings() -> Settings:
    return Settings()
