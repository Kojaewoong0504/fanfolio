from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Pydantic v2 settings: environment variables are parsed and typed once."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    app_env: str = "development"
    database_url: str = "sqlite+aiosqlite:///./fanfolio.db"


@lru_cache
def get_settings() -> Settings:
    return Settings()
