"""
Stats router: aggregated homepage dashboard data.
"""

import asyncio
from datetime import datetime, timezone
from fastapi import APIRouter
from app.deps import DbDep, RedisDep, SettingsDep
from app.services import cache_service as cache
from app.services.votes_service import list_votes_v4
from app.services.bills_service import list_bills_v4
from app.services.members_service import count_current_members

router = APIRouter()

# The Knesset has exactly 120 seats by law (Basic Law: The Knesset, Article 1)
_KNESSET_SEATS = 120


@router.get("/dashboard")
async def get_dashboard(db: DbDep, redis: RedisDep, settings: SettingsDep):
    cache_key = "stats:dashboard"

    async def factory() -> dict:
        now = datetime.now(timezone.utc).isoformat()
        current_knesset = settings.current_knesset

        votes_response, bills_response, active_mks = await asyncio.gather(
            list_votes_v4(redis, page=1, limit=10),
            list_bills_v4(redis, page=1, limit=10, knesset_num=current_knesset),
            count_current_members(db),
        )

        recent_votes_raw = votes_response.get("data", [])
        total_votes = votes_response.get("pagination", {}).get("total", 0)
        recent_votes = [
            {
                "vote_id": v["id"],
                "vote_date": v["vote_date"],
                "vote_item_dscr": v["vote_item_dscr"],
                "sess_item_dscr": v["sess_item_dscr"],
                "vote_type": v["vote_type"],
                "session_num": v["session_id"],
                "is_accepted": v["is_accepted"],
                "total_for": v["total_for"],
                "total_against": v["total_against"],
                "total_abstain": v["total_abstain"],
            }
            for v in recent_votes_raw
        ]

        recent_bills_raw = bills_response.get("data", [])
        total_bills = bills_response.get("pagination", {}).get("total", 0)
        recent_bills = [
            {
                "bill_id": b["bill_id"],
                "name": b["name"],
                "status_desc": b["status_desc"],
                "publication_date": b["publication_date"],
                "initiator_name": b["initiators"][0]["mk_name"] if b.get("initiators") else None,
            }
            for b in recent_bills_raw
        ]

        return {
            "knesset_num": current_knesset,
            "total_votes_this_knesset": total_votes,
            "total_bills": total_bills,
            "total_active_mks": active_mks or _KNESSET_SEATS,
            "recent_votes": recent_votes,
            "recent_bills": recent_bills,
            "cached_at": now,
        }

    return await cache.get_or_set(cache_key, factory, cache.TTL_DASHBOARD, redis)
