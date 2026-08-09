import re
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Pydantic v2 settings: environment variables are parsed and typed once."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    app_env: str = "development"
    database_url: str = "sqlite+aiosqlite:///./fanfolio.db"
    auto_create_schema: bool = True
    seed_demo_catalog: bool = False
    storage_dir: str = "./storage"
    storage_backend: str = "local"
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
    data_protection_key: str = ""
    allow_data_bootstrap: bool = False
    mail_delivery_mode: str = "console"
    mail_from: str = "Fanfolio <no-reply@localhost>"
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
    upload_cleanup_interval_seconds: int = 15 * 60
    celery_broker_url: str = "redis://localhost:6379/0"
    celery_result_backend: str = "redis://localhost:6379/0"
    rate_limit_backend: str = "memory"
    rate_limit_redis_url: str = "redis://localhost:6379/1"

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
    def is_hosted(self) -> bool:
        """Use browser-safe auth rules in both staging and production."""
        return self.app_env in {"staging", "production"}

    def validate_runtime(self) -> None:
        """Fail fast when a production process would start with unsafe defaults."""
        if self.storage_backend not in {"local", "s3"}:
            raise ValueError("STORAGE_BACKEND must be local or s3")
        if self.storage_backend == "s3" and not self.s3_bucket:
            raise ValueError("S3_BUCKET is required when STORAGE_BACKEND is s3")
        if self.upload_cleanup_interval_seconds <= 0:
            raise ValueError("UPLOAD_CLEANUP_INTERVAL_SECONDS must be positive")
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
        if self.mail_delivery_mode != "smtp":
            raise ValueError("MAIL_DELIVERY_MODE must be smtp in production")
        if not self.smtp_host or not self.mail_from:
            raise ValueError("SMTP_HOST and MAIL_FROM are required in production")
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
