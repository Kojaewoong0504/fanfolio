from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Pydantic v2 settings: environment variables are parsed and typed once."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    app_env: str = "development"
    database_url: str = "sqlite+aiosqlite:///./fanfolio.db"
    auto_create_schema: bool = True
    storage_dir: str = "./storage"
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
    frontend_url: str = "http://localhost:5173"
    mail_delivery_mode: str = "console"
    mail_from: str = "Fanfolio <no-reply@localhost>"
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_use_tls: bool = True
    task_queue_mode: str = "inline"
    celery_broker_url: str = "redis://localhost:6379/0"
    celery_result_backend: str = "redis://localhost:6379/0"
    rate_limit_backend: str = "memory"
    rate_limit_redis_url: str = "redis://localhost:6379/1"

    @property
    def allowed_origins(self) -> list[str]:
        """Parse the comma-separated browser origins used by CORS."""
        return [origin.strip() for origin in self.frontend_origins.split(",") if origin.strip()]

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
        return self.database_url

    def validate_runtime(self) -> None:
        """Fail fast when a production process would start with unsafe defaults."""
        if self.app_env != "production":
            return
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
        if self.asset_scan_mode != "clamav":
            raise ValueError("ASSET_SCAN_MODE must be clamav in production")
        if not self.clamav_host:
            raise ValueError("CLAMAV_HOST is required when ASSET_SCAN_MODE is clamav")


@lru_cache
def get_settings() -> Settings:
    return Settings()
