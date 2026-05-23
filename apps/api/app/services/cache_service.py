"""
In-memory cache-aside helpers.

Pattern: get_or_set(key, async factory_fn, ttl)
  1. Check in-memory store for a live (non-expired) entry
  2. On cache miss → call factory_fn() to compute result
  3. Store result with expiry time, return result

TTL constants (seconds):
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

import fnmatch
import logging
import time
from collections.abc import Callable, Awaitable
from typing import Any, TypeVar

logger = logging.getLogger(__name__)

T = TypeVar("T")

# ── TTL constants (seconds) ───────────────────────────────────────────────────
TTL_DASHBOARD = 3_600  # 1 hour
TTL_BILLS_LIST = 21_600  # 6 hours
TTL_BILL_DETAIL = 43_200  # 12 hours
TTL_VOTES_LIST = 7_200  # 2 hours
TTL_VOTE_DETAIL = 86_400  # 24 hours
TTL_MK_LIST = 21_600  # 6 hours
TTL_MK_STATS = 43_200  # 12 hours
TTL_PARTY_LIST = 21_600  # 6 hours
TTL_PARTY_COH = 43_200  # 12 hours
TTL_RAW_CSV = 21_600  # 6 hours

# Global in-memory store: key -> (expires_at, value)
_store: dict[str, tuple[float, Any]] = {}


async def get_or_set(
    key: str,
    factory: Callable[[], Awaitable[T]],
    ttl: int,
) -> T:
    """
    Cache-aside: read from memory, fall back to factory(), write result.
    factory() must return a JSON-serialisable object.
    """
    now = time.monotonic()
    entry = _store.get(key)
    if entry is not None and entry[0] > now:
        logger.debug("Cache HIT: %s", key)
        return entry[1]
    logger.debug("Cache MISS: %s", key)
    result = await factory()
    _store[key] = (now + ttl, result)
    return result


def invalidate(pattern: str) -> int:
    """Delete all keys matching a glob pattern."""
    keys_to_delete = [k for k in list(_store.keys()) if fnmatch.fnmatch(k, pattern)]
    for k in keys_to_delete:
        del _store[k]
    return len(keys_to_delete)


async def invalidate_many(patterns: list[str]) -> None:
    """Delete all keys matching any of the given patterns."""
    for p in patterns:
        invalidate(p)


def make_list_key(prefix: str, **params: Any) -> str:
    """
    Build a deterministic cache key from query params.
    E.g. make_list_key("bills:list", page=1, limit=20, search="")
    → "bills:list:limit=20:page=1:search="
    """
    sorted_parts = ":".join(f"{k}={v}" for k, v in sorted(params.items()) if v is not None)
    return f"{prefix}:{sorted_parts}" if sorted_parts else prefix
