from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # Application
    app_env: str = "development"
    app_port: int = 8000
    allowed_origins: str = "http://localhost:3000"

    # PostgreSQL
    database_url: str = "postgresql+asyncpg://knesset:knesset@localhost:5432/knessetil"
    database_pool_size: int = 10

    # Open Knesset data source
    oknesset_base_url: str = "https://production.oknesset.org/pipelines/data"
    oknesset_sync_interval_hours: int = 6

    # When set, only rows for this Knesset are synced to the database.
    # Used in production to keep the Supabase database within free-tier limits.
    # None = sync all Knessets (local dev default).
    oknesset_knesset_filter: int | None = None

    # Rate limiting
    rate_limit_default: str = "100/minute"
    rate_limit_search: str = "30/minute"

    # Current Knesset number — used for default filters and OData v4 routing
    current_knesset: int = 25

    # Logging
    log_level: str = "INFO"

    @property
    def origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",")]

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
