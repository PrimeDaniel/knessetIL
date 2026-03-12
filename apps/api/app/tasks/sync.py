"""
Background sync task — runs every 6 hours (configured in main.py).
Fetches fresh CSVs from oknesset, invalidates stale Redis cache keys.
"""
import logging

logger = logging.getLogger(__name__)


async def run_sync() -> None:
    """
    1. Fetch all CSV datasets from oknesset
    2. Validate they are non-empty
    3. Invalidate affected Redis cache key patterns
    """
    logger.info("Starting oknesset CSV sync...")

    try:
        from app.config import get_settings
        from app.deps import get_redis
        import redis.asyncio as aioredis
        from app.services.oknesset_client import (
            fetch_all_mk_data, fetch_vote_data, fetch_bills_data, fetch_csv
        )
        from app.services.cache_service import invalidate_many

        settings = get_settings()
        redis_client = aioredis.from_url(
            settings.redis_url,
            password=settings.redis_password or None,
            encoding="utf-8",
            decode_responses=True,
        )

        # Fetch all datasets (validates connectivity)
        await fetch_all_mk_data()
        await fetch_vote_data()
        await fetch_bills_data()
        await fetch_csv("factions")

        # Invalidate all cached data so next request gets fresh results
        patterns_to_invalidate = [
            "stats:*",
            "bills:list:*",
            "votes:list:*",
            "members:list:*",
            "parties:list:*",
        ]
        await invalidate_many(patterns_to_invalidate, redis_client)
        await redis_client.aclose()

        logger.info("oknesset CSV sync complete — cache invalidated")

    except Exception as exc:
        logger.error("CSV sync failed: %s", exc, exc_info=True)
