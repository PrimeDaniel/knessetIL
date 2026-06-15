"""
Cache-aside + stale-while-revalidate helpers.

Two access patterns:

  get_or_set(key, factory, ttl)            -> value
      Classic cache-aside.  On a miss / expiry it BLOCKS while factory() runs.
      Used for cheap local-DB responses where blocking is fine.

  get_or_set_swr(key, factory, ttl)        -> (value, is_stale)
      Lazy / stale-while-revalidate.  Once a value exists it is served
      INSTANTLY forever; when it ages past `ttl` the stale value is returned
      immediately AND a background task refreshes it.  `is_stale` lets the API
      tell the client "data shown, refreshing in the background" (מעדכן…).
      Values are also written through to the `cache_entries` Postgres table so
      a fresh process — or a different worker — serves the last known result
      without re-hitting the slow upstream OData API.

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

import asyncio
import fnmatch
import logging
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import datetime, timezone
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


@dataclass
class _Entry:
    value: Any
    soft_expires_at: float  # unix epoch seconds; past this = stale


# Global in-memory store: key -> _Entry
_store: dict[str, _Entry] = {}

# Keys currently being revalidated in the background (dedup).
_refreshing: set[str] = set()

# Strong references to in-flight background tasks (prevents GC mid-flight).
_bg_tasks: set[asyncio.Task] = set()


# ── Postgres write-through persistence ────────────────────────────────────────
# Imported lazily inside each helper so importing cache_service never forces the
# DB engine to initialise (keeps unit tests and tooling lightweight).


async def _db_load(key: str) -> _Entry | None:
    try:
        from sqlalchemy import select

        from app.database import AsyncSessionLocal
        from app.db_models.cache import CacheEntry

        async with AsyncSessionLocal() as session:
            row = (
                await session.execute(select(CacheEntry).where(CacheEntry.key == key))
            ).scalar_one_or_none()
        if row is None:
            return None
        return _Entry(value=row.value, soft_expires_at=row.soft_expires_at.timestamp())
    except Exception as exc:  # never let cache persistence break a request
        logger.warning("cache DB load failed for %s: %s", key, exc)
        return None


async def _db_save(key: str, value: Any, soft_expires_at: float) -> None:
    try:
        from sqlalchemy.dialects.postgresql import insert

        from app.database import AsyncSessionLocal
        from app.db_models.cache import CacheEntry

        soft_dt = datetime.fromtimestamp(soft_expires_at, tz=timezone.utc)
        now = datetime.now(timezone.utc)
        async with AsyncSessionLocal() as session:
            stmt = insert(CacheEntry).values(
                key=key, value=value, soft_expires_at=soft_dt, updated_at=now
            )
            stmt = stmt.on_conflict_do_update(
                index_elements=[CacheEntry.key],
                set_={"value": value, "soft_expires_at": soft_dt, "updated_at": now},
            )
            await session.execute(stmt)
            await session.commit()
    except Exception as exc:
        logger.warning("cache DB save failed for %s: %s", key, exc)


async def _db_delete(pattern: str) -> None:
    like = pattern.replace("*", "%").replace("?", "_")
    try:
        from sqlalchemy import delete

        from app.database import AsyncSessionLocal
        from app.db_models.cache import CacheEntry

        async with AsyncSessionLocal() as session:
            await session.execute(delete(CacheEntry).where(CacheEntry.key.like(like)))
            await session.commit()
    except Exception as exc:
        logger.warning("cache DB delete failed for %s: %s", pattern, exc)


# ── Background revalidation ───────────────────────────────────────────────────


def _schedule_refresh(
    key: str,
    factory: Callable[[], Awaitable[Any]],
    ttl: int,
    persist: bool,
    cache_ok: Callable[[Any], bool] | None,
) -> None:
    """Kick off a background refresh for `key` unless one is already running."""
    if key in _refreshing:
        return
    _refreshing.add(key)
    try:
        task = asyncio.create_task(_do_refresh(key, factory, ttl, persist, cache_ok))
    except RuntimeError:
        # No running event loop (e.g. called outside async context) — skip.
        _refreshing.discard(key)
        return
    _bg_tasks.add(task)
    task.add_done_callback(_bg_tasks.discard)


async def _do_refresh(
    key: str,
    factory: Callable[[], Awaitable[Any]],
    ttl: int,
    persist: bool,
    cache_ok: Callable[[Any], bool] | None,
) -> None:
    try:
        value = await factory()
        if cache_ok is not None and not cache_ok(value):
            # Upstream returned a degraded/empty payload — keep the stale value
            # rather than overwriting good data with a transient failure.
            logger.warning("SWR refresh for %s produced a non-cacheable result; keeping stale", key)
            return
        soft = time.time() + ttl
        _store[key] = _Entry(value=value, soft_expires_at=soft)
        if persist:
            await _db_save(key, value, soft)
        logger.info("SWR background refresh OK: %s", key)
    except Exception as exc:
        logger.warning("SWR background refresh FAILED for %s (keeping stale): %s", key, exc)
    finally:
        _refreshing.discard(key)


# ── Public API ────────────────────────────────────────────────────────────────


async def get_or_set(
    key: str,
    factory: Callable[[], Awaitable[T]],
    ttl: int,
    cache_ok: Callable[[T], bool] | None = None,
) -> T:
    """
    Cache-aside: read from memory, fall back to factory(), write result.
    Blocks while factory() runs on a miss/expiry.  factory() must return a
    JSON-serialisable object.
    """
    now = time.time()
    entry = _store.get(key)
    if entry is not None and entry.soft_expires_at > now:
        logger.debug("Cache HIT: %s", key)
        return entry.value
    logger.debug("Cache MISS: %s", key)
    result = await factory()
    
    if cache_ok is not None and not cache_ok(result):
        return result
    if result is None and cache_ok is None:
        # Prevent caching None by default, as it usually represents a transient error
        return result
        
    _store[key] = _Entry(value=result, soft_expires_at=now + ttl)
    return result


async def get_or_set_swr(
    key: str,
    factory: Callable[[], Awaitable[T]],
    ttl: int,
    persist: bool = True,
    cache_ok: Callable[[T], bool] | None = None,
) -> tuple[T, bool]:
    """
    Stale-while-revalidate cache-aside.

    Returns ``(value, is_stale)``:
      * fresh in-memory hit            → (value, False)
      * stale in-memory hit            → (value, True)  + background refresh
      * cold in-memory, warm in DB     → (value, is_stale) + refresh if stale
      * cold everywhere (true miss)    → blocks on factory(), then (value, False)

    Only the very first computation (for the whole deployment, thanks to the DB
    write-through) blocks; everything afterwards is served instantly.

    ``cache_ok`` guards against poisoning the cache with transient upstream
    failures: if provided and it returns ``False`` for a freshly computed value,
    that value is returned to the caller but is NOT stored or persisted, so the
    next request retries instead of serving a bad (e.g. empty) payload.
    """
    now = time.time()
    entry = _store.get(key)

    if entry is not None:
        if entry.soft_expires_at > now:
            return entry.value, False
        _schedule_refresh(key, factory, ttl, persist, cache_ok)
        return entry.value, True

    # Not in memory — try the shared Postgres cache before paying for factory().
    if persist:
        loaded = await _db_load(key)
        if loaded is not None:
            _store[key] = loaded
            is_stale = loaded.soft_expires_at <= now
            if is_stale:
                _schedule_refresh(key, factory, ttl, persist, cache_ok)
            return loaded.value, is_stale

    # True cold miss — compute synchronously (first-ever load).
    result = await factory()
    if cache_ok is not None and not cache_ok(result):
        # Don't cache a degraded result; let the next request try again.
        return result, False
    _store[key] = _Entry(value=result, soft_expires_at=now + ttl)
    if persist:
        await _db_save(key, result, now + ttl)
    return result, False


def invalidate(pattern: str) -> int:
    """Delete all in-memory keys matching a glob pattern."""
    keys_to_delete = [k for k in list(_store.keys()) if fnmatch.fnmatch(k, pattern)]
    for k in keys_to_delete:
        del _store[k]
    return len(keys_to_delete)


async def invalidate_many(patterns: list[str]) -> None:
    """Delete all in-memory AND persisted keys matching any of the patterns."""
    for p in patterns:
        invalidate(p)
        await _db_delete(p)


def make_list_key(prefix: str, **params: Any) -> str:
    """
    Build a deterministic cache key from query params.
    E.g. make_list_key("bills:list", page=1, limit=20, search="")
    → "bills:list:limit=20:page=1:search="
    """
    sorted_parts = ":".join(f"{k}={v}" for k, v in sorted(params.items()) if v is not None)
    return f"{prefix}:{sorted_parts}" if sorted_parts else prefix
