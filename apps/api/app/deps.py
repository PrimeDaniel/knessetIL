"""
Dependency injection for FastAPI routes.
Provides typed aliases for Redis and SQLAlchemy async session.
"""

from typing import Annotated, AsyncGenerator

import redis.asyncio as aioredis
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.database import AsyncSessionLocal


# ── Redis ─────────────────────────────────────────────────────────────────────

_redis_pool: aioredis.Redis | None = None


def get_redis_client(settings: Settings | None = None) -> aioredis.Redis:
    """Return (creating if needed) the shared Redis client — usable outside DI context."""
    global _redis_pool
    if _redis_pool is None:
        s = settings or get_settings()
        _redis_pool = aioredis.from_url(
            s.redis_url,
            password=s.redis_password or None,
            encoding="utf-8",
            decode_responses=True,
        )
    return _redis_pool


async def get_redis(
    settings: Annotated[Settings, Depends(get_settings)],
) -> AsyncGenerator[aioredis.Redis, None]:
    yield get_redis_client(settings)


RedisDep = Annotated[aioredis.Redis, Depends(get_redis)]
SettingsDep = Annotated[Settings, Depends(get_settings)]


# ── Database ──────────────────────────────────────────────────────────────────


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session


DbDep = Annotated[AsyncSession, Depends(get_db)]
