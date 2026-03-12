"""
Stats router: aggregated homepage dashboard data.
"""
from datetime import datetime, timezone
from fastapi import APIRouter, Request
from app.deps import RedisDep
from app.services import cache_service as cache
from app.services.oknesset_client import fetch_vote_data, fetch_bills_data

router = APIRouter()

_CURRENT_KNESSET = 25


@router.get("/dashboard")
async def get_dashboard(request: Request, redis: RedisDep):
    cache_key = "stats:dashboard"

    async def factory() -> dict:
        vote_frames = await fetch_vote_data()
        bill_frames = await fetch_bills_data()

        hdr_df = vote_frames.get("view_vote_rslts_hdr_approved")
        mk_df  = vote_frames.get("view_vote_mk_individual")
        laws_df = bill_frames.get("laws")

        import pandas as pd

        def safe(v):
            return None if pd.isna(v) else v

        now = datetime.now(timezone.utc).isoformat()

        # Vote stats
        total_votes = len(hdr_df) if hdr_df is not None else 0
        accepted = int((hdr_df["is_accepted"] == True).sum()) if hdr_df is not None and "is_accepted" in hdr_df.columns else 0
        rejected = total_votes - accepted

        # Bill stats
        total_bills = len(laws_df) if laws_df is not None else 0

        # Recent votes (last 10)
        recent_votes: list[dict] = []
        if hdr_df is not None and not hdr_df.empty:
            sort_col = "vote_date" if "vote_date" in hdr_df.columns else hdr_df.columns[0]
            recent_df = hdr_df.sort_values(sort_col, ascending=False).head(10)
            id_col = "id" if "id" in recent_df.columns else recent_df.columns[0]
            for _, row in recent_df.iterrows():
                recent_votes.append({
                    "vote_id": int(safe(row.get(id_col)) or 0),
                    "vote_date": str(safe(row.get("vote_date", ""))),
                    "vote_item_dscr": safe(row.get("vote_item_dscr", "")),
                    "is_accepted": bool(safe(row.get("is_accepted", False))),
                    "total_for": int(safe(row.get("total_for")) or 0),
                    "total_against": int(safe(row.get("total_against")) or 0),
                    "total_abstain": int(safe(row.get("total_abstain")) or 0),
                })

        # Recent bills (last 10)
        recent_bills: list[dict] = []
        if laws_df is not None and not laws_df.empty:
            pub_col = "publication_date" if "publication_date" in laws_df.columns else laws_df.columns[0]
            id_col = "law_id" if "law_id" in laws_df.columns else "bill_id"
            name_col = "law_name" if "law_name" in laws_df.columns else "name"
            status_col = "law_status_desc" if "law_status_desc" in laws_df.columns else "status_desc"
            recent_laws = laws_df.sort_values(pub_col, ascending=False, na_position="last").head(10)
            for _, row in recent_laws.iterrows():
                recent_bills.append({
                    "bill_id": int(safe(row.get(id_col)) or 0),
                    "name": safe(row.get(name_col, "")),
                    "status_desc": safe(row.get(status_col, "")),
                    "publication_date": str(safe(row.get(pub_col))) if safe(row.get(pub_col)) else None,
                    "initiator_name": None,
                })

        return {
            "knesset_num": _CURRENT_KNESSET,
            "total_votes_this_knesset": total_votes,
            "total_votes_accepted": accepted,
            "total_votes_rejected": rejected,
            "total_bills": total_bills,
            "bills_passed": 0,
            "total_active_mks": 120,
            "total_factions": 0,
            "recent_votes": recent_votes,
            "recent_bills": recent_bills,
            "most_rebellious_mks": [],
            "cached_at": now,
        }

    return await cache.get_or_set(cache_key, factory, cache.TTL_DASHBOARD, redis)
