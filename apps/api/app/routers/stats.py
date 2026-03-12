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

        # Real dataset keys (corrected from Phase 2 schema verification)
        hdr_df  = vote_frames.get("view_vote_rslts_hdr_approved")
        bills_df = bill_frames.get("kns_bill")          # PascalCase columns

        import pandas as pd

        def safe(v):
            try:
                return None if pd.isna(v) else v
            except (TypeError, ValueError):
                return v

        now = datetime.now(timezone.utc).isoformat()

        # Vote stats — is_accepted is INTEGER 0/1 in CSV
        total_votes = len(hdr_df) if hdr_df is not None else 0
        accepted = int((hdr_df["is_accepted"] == 1).sum()) if hdr_df is not None and "is_accepted" in hdr_df.columns else 0
        rejected = total_votes - accepted

        # Bill stats — kns_bill uses BillID/KnessetNum
        total_bills = len(bills_df) if bills_df is not None else 0

        # Recent votes (last 10, sorted by vote_date)
        recent_votes: list[dict] = []
        if hdr_df is not None and not hdr_df.empty:
            recent_df = hdr_df.sort_values("vote_date", ascending=False).head(10)
            for _, row in recent_df.iterrows():
                recent_votes.append({
                    "vote_id":       int(safe(row.get("id")) or 0),
                    "vote_date":     str(safe(row.get("vote_date", ""))),
                    "vote_item_dscr": safe(row.get("vote_item_dscr", "")),
                    "is_accepted":   bool(int(safe(row.get("is_accepted")) or 0)),
                    "total_for":     int(safe(row.get("total_for")) or 0),
                    "total_against": int(safe(row.get("total_against")) or 0),
                    "total_abstain": int(safe(row.get("total_abstain")) or 0),
                })

        # Recent bills (last 10 by PublicationDate) — PascalCase columns
        from app.services.bills_service import STATUS_MAP
        recent_bills: list[dict] = []
        if bills_df is not None and not bills_df.empty:
            recent_laws = bills_df.sort_values("PublicationDate", ascending=False, na_position="last").head(10)
            for _, row in recent_laws.iterrows():
                status_id = int(safe(row.get("StatusID")) or 0)
                recent_bills.append({
                    "bill_id":        int(safe(row.get("BillID")) or 0),
                    "name":           safe(row.get("Name", "")),
                    "status_desc":    STATUS_MAP.get(status_id, f"סטטוס {status_id}"),
                    "publication_date": str(safe(row["PublicationDate"]))[:10] if safe(row.get("PublicationDate")) else None,
                    "initiator_name": None,
                })

        # Monthly vote trend — last 12 months, grouped by YYYY-MM
        vote_trend: list[dict] = []
        if hdr_df is not None and "vote_date" in hdr_df.columns and "is_accepted" in hdr_df.columns:
            trend_df = hdr_df[["vote_date", "is_accepted"]].copy()
            trend_df["vote_date"] = pd.to_datetime(trend_df["vote_date"], errors="coerce")
            trend_df = trend_df.dropna(subset=["vote_date"])
            trend_df["month"] = trend_df["vote_date"].dt.to_period("M")
            trend_df["is_accepted"] = pd.to_numeric(trend_df["is_accepted"], errors="coerce").fillna(0).astype(int)
            monthly = (
                trend_df.groupby("month")["is_accepted"]
                .agg(accepted=lambda x: (x == 1).sum(), rejected=lambda x: (x == 0).sum())
                .reset_index()
                .sort_values("month")
                .tail(12)
            )
            for _, row in monthly.iterrows():
                vote_trend.append({
                    "date":     str(row["month"]),
                    "accepted": int(row["accepted"]),
                    "rejected": int(row["rejected"]),
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
            "vote_trend": vote_trend,
            "most_rebellious_mks": [],
            "cached_at": now,
        }

    return await cache.get_or_set(cache_key, factory, cache.TTL_DASHBOARD, redis)
