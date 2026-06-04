"""
Stats router: aggregated homepage dashboard data.
"""

import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter

from app.deps import SettingsDep
from app.services import cache_service as cache
from app.services.votes_service import list_votes_v4
from app.services.bills_service import list_bills_v4
from app.services.oknesset_client import fetch_v4_count

# OData v4 StatusID for a bill that became law ("הפך לחוק", canonical status 13).
_V4_STATUS_BECAME_LAW = 118

router = APIRouter()

# The Knesset has exactly 120 seats by law (Basic Law: The Knesset, Article 1).
# The members table can momentarily report 121 (e.g. an outgoing + replacement MK
# both flagged current during a handover), so the homepage stat is fixed at 120.
_KNESSET_SEATS = 120


@router.get("/dashboard")
async def get_dashboard(settings: SettingsDep):
    cache_key = "stats:dashboard"
    current_knesset = settings.current_knesset

    # NOTE: the factory must be self-contained (no request-scoped DB session),
    # because get_or_set_swr may run it in a background task after the original
    # request has already returned and its session is closed.
    async def factory() -> dict:
        now = datetime.now(timezone.utc).isoformat()

        # Live OData calls are independent → run them concurrently. They use the
        # shared httpx client (cheap $count for became-law, no per-MK expansion).
        votes_response, bills_response, bills_became_law = await asyncio.gather(
            list_votes_v4(page=1, limit=10),
            list_bills_v4(page=1, limit=10, knesset_num=current_knesset),
            fetch_v4_count(
                "KNS_Bill",
                f"KnessetNum eq {current_knesset} and StatusID eq {_V4_STATUS_BECAME_LAW}",
            ),
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
            "total_active_mks": _KNESSET_SEATS,
            "bills_passed_into_law": bills_became_law,
            "recent_votes": recent_votes,
            "recent_bills": recent_bills,
            "cached_at": now,
        }

    # Only cache a snapshot that actually has data — guards against persisting a
    # transient OData failure (empty votes/bills) as the homepage state.
    def _ok(d: dict) -> bool:
        return bool(d.get("recent_votes")) or d.get("total_bills", 0) > 0

    # Lazy cache: instant response from the last-known snapshot, background
    # refresh when stale. `updating` drives the client's "מעדכן…" notice.
    data, updating = await cache.get_or_set_swr(
        cache_key, factory, cache.TTL_DASHBOARD, cache_ok=_ok
    )
    return {**data, "updating": updating}
