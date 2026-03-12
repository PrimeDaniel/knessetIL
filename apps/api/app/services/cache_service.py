"""
Redis cache-aside helpers.

Pattern: get_or_set(key, async factory_fn, ttl, redis)
  1. Try GET key from Redis
  2. On cache miss → call factory_fn() to compute result
  3. SET key with TTL, return result

TTL constants (seconds) — see architecture plan for rationale:
  DASHBOARD    1 hour   — aggregated, tolerable staleness
  BILLS_LIST   6 hours  — bills change slowly
  BILL_DETAIL  12 hours — individual status rarely changes mid-day
  VOTES_LIST   2 hours  — sessions happen on specific days only
  VOTE_DETAIL  86400    — historical votes never change
  MK_LIST      6 hours
  MK_STATS     12 hours — expensive rebellion/attendance computation
  PARTY_LIST   6 hours
  PARTY_COH    12 hours — expensive cohesion computation
  RAW_CSV      6 hours  — source sync interval
"""
import json
import logging
from collections.abc import Callable, Awaitable
from typing import Any, TypeVar

import redis.asyncio as aioredis

logger = logging.getLogger(__name__)

T = TypeVar("T")

# ── TTL constants (seconds) ───────────────────────────────────────────────────
TTL_DASHBOARD    = 3_600       # 1 hour
TTL_BILLS_LIST   = 21_600      # 6 hours
TTL_BILL_DETAIL  = 43_200      # 12 hours
TTL_VOTES_LIST   = 7_200       # 2 hours
TTL_VOTE_DETAIL  = 86_400      # 24 hours
TTL_MK_LIST      = 21_600      # 6 hours
TTL_MK_STATS     = 43_200      # 12 hours
TTL_PARTY_LIST   = 21_600      # 6 hours
TTL_PARTY_COH    = 43_200      # 12 hours
TTL_RAW_CSV      = 21_600      # 6 hours


async def get_or_set(
    key: str,
    factory: Callable[[], Awaitable[T]],
    ttl: int,
    redis: aioredis.Redis,
) -> T:
    """
    Cache-aside: read from Redis, fall back to factory(), write result.
    factory() must return a JSON-serialisable object.
    """
    cached = await redis.get(key)
    if cached is not None:
        logger.debug("Cache HIT: %s", key)
        return json.loads(cached)

    logger.debug("Cache MISS: %s", key)
    result = await factory()
    try:
        await redis.setex(key, ttl, json.dumps(result, default=str, ensure_ascii=False))
    except Exception as exc:
        logger.warning("Failed to cache key %s: %s", key, exc)
    return result


async def invalidate(pattern: str, redis: aioredis.Redis) -> int:
    """Delete all keys matching a glob pattern. Returns count deleted."""
    keys = await redis.keys(pattern)
    if keys:
        return await redis.delete(*keys)
    return 0


async def invalidate_many(patterns: list[str], redis: aioredis.Redis) -> None:
    """Delete all keys matching any of the given patterns."""
    import asyncio
    await asyncio.gather(*[invalidate(p, redis) for p in patterns])


def make_list_key(prefix: str, **params: Any) -> str:
    """
    Build a deterministic cache key from query params.
    E.g. make_list_key("bills:list", page=1, limit=20, search="")
    → "bills:list:limit=20:page=1:search="
    """
    sorted_parts = ":".join(f"{k}={v}" for k, v in sorted(params.items()) if v is not None)
    return f"{prefix}:{sorted_parts}" if sorted_parts else prefix
