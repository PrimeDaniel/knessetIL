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

    # Run the 6-hour CSV sync inside the API process (APScheduler).
    # Set to False in production when an external scheduler (e.g. a GitHub
    # Actions cron) owns the sync — avoids double-running and works even when
    # the API host has scaled to zero. True keeps local dev self-contained.
    enable_sync_scheduler: bool = True

    # Rate limiting
    rate_limit_default: str = "100/minute"
    rate_limit_search: str = "30/minute"

    # AI explanations (Claude). Generates short Hebrew explanations of bills/votes
    # on demand and caches them in the ai_explanations table.
    anthropic_api_key: str = ""
    ai_explanation_model: str = "claude-haiku-4-5"
    ai_explanations_enabled: bool = True

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
