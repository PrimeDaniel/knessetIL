"""
Stats router: aggregated homepage dashboard data.
"""
import asyncio
from datetime import datetime, timezone
from fastapi import APIRouter, Request
from app.deps import RedisDep
from app.services import cache_service as cache
from app.services.votes_service import list_votes_v4
from app.services.bills_service import list_bills_v4

router = APIRouter()

_CURRENT_KNESSET = 25


@router.get("/dashboard")
async def get_dashboard(request: Request, redis: RedisDep):
    cache_key = "stats:dashboard"

    async def factory() -> dict:
        now = datetime.now(timezone.utc).isoformat()

        # Fetch recent votes (v4) and recent bills (v4) concurrently
        votes_response, bills_response = await asyncio.gather(
            list_votes_v4(redis, page=1, limit=10),
            list_bills_v4(redis, page=1, limit=10, knesset_num=_CURRENT_KNESSET),
        )

        # ── Recent votes ──────────────────────────────────────────────────────
        recent_votes_raw = votes_response.get("data", [])
        total_votes = votes_response.get("pagination", {}).get("total", 0)

        recent_votes: list[dict] = [
            {
                "vote_id":        v["id"],
                "vote_date":      v["vote_date"],
                "vote_item_dscr": v["vote_item_dscr"],
                "sess_item_dscr": v["sess_item_dscr"],
                "vote_type":      v["vote_type"],
                "session_num":    v["session_id"],
                "is_accepted":    v["is_accepted"],
                "total_for":      v["total_for"],
                "total_against":  v["total_against"],
                "total_abstain":  v["total_abstain"],
            }
            for v in recent_votes_raw
        ]

        # ── Recent bills ──────────────────────────────────────────────────────
        recent_bills_raw = bills_response.get("data", [])
        total_bills = bills_response.get("pagination", {}).get("total", 0)

        recent_bills: list[dict] = [
            {
                "bill_id":          b["bill_id"],
                "name":             b["name"],
                "status_desc":      b["status_desc"],
                "publication_date": b["publication_date"],
                "initiator_name":   None,
            }
            for b in recent_bills_raw
        ]

        return {
            "knesset_num":              _CURRENT_KNESSET,
            "total_votes_this_knesset": total_votes,
            "total_votes_accepted":     0,  # not computable from v4 without fetching all results
            "total_votes_rejected":     0,
            "total_bills":              total_bills,
            "bills_passed":             0,
            "total_active_mks":         120,
            "total_factions":           0,
            "recent_votes":             recent_votes,
            "recent_bills":             recent_bills,
            "vote_trend":               [],
            "most_rebellious_mks":      [],
            "cached_at":                now,
        }

    return await cache.get_or_set(cache_key, factory, cache.TTL_DASHBOARD, redis)
