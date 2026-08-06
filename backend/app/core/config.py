from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Pydantic v2 settings: environment variables are parsed and typed once."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    app_env: str = "development"
    database_url: str = "sqlite+aiosqlite:///./fanfolio.db"
    storage_dir: str = "./storage"
    frontend_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
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


@lru_cache
def get_settings() -> Settings:
    return Settings()
