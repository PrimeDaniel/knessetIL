from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # Application
    app_env: str = "development"
    app_port: int = 8000
    allowed_origins: str = "http://localhost:3000"

    # Redis
    redis_url: str = "redis://localhost:6379"
    redis_password: str = ""

    # PostgreSQL
    database_url: str = "postgresql+asyncpg://knesset:knesset@localhost:5432/knessetil"
    database_pool_size: int = 10

    # Open Knesset data source
    oknesset_base_url: str = "https://production.oknesset.org/pipelines/data"
    oknesset_sync_interval_hours: int = 6

    # Rate limiting
    rate_limit_default: str = "100/minute"
    rate_limit_search: str = "30/minute"

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
