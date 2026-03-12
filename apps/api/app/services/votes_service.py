"""
Votes service: queries view_vote_rslts_hdr_approved + view_vote_mk_individual.
Builds VoteResult, VoteDetail (with per-party breakdown and per-MK records).
"""
from __future__ import annotations

import logging
import math
from datetime import datetime, timezone
from typing import Any

import pandas as pd
import redis.asyncio as aioredis

from app.services import cache_service as cache
from app.services.oknesset_client import fetch_vote_data, fetch_csv

logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe(val: Any) -> Any:
    if pd.isna(val):
        return None
    return val


def _row_to_vote(row: pd.Series) -> dict:
    return {
        "id": int(_safe(row.get("id")) or row.get("rowid", 0)),
        "knesset_num": int(_safe(row.get("knesset_num")) or 0),
        "session_id": int(_safe(row.get("session_id")) or 0),
        "vote_date": str(_safe(row.get("vote_date", ""))),
        "vote_time": str(_safe(row.get("vote_time"))) if _safe(row.get("vote_time")) else None,
        "vote_item_id": int(_safe(row.get("vote_item_id")) or 0),
        "vote_item_dscr": _safe(row.get("vote_item_dscr", "")),
        "vote_type": _safe(row.get("vote_type")),
        "is_accepted": bool(_safe(row.get("is_accepted", False))),
        "total_for": int(_safe(row.get("total_for")) or 0),
        "total_against": int(_safe(row.get("total_against")) or 0),
        "total_abstain": int(_safe(row.get("total_abstain")) or 0),
        "total_absent": int(_safe(row.get("total_absent")) or 0),
    }


async def list_votes(
    redis: aioredis.Redis,
    page: int = 1,
    limit: int = 20,
    knesset_num: int | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    is_accepted: bool | None = None,
) -> dict:
    cache_key = cache.make_list_key(
        "votes:list", page=page, limit=limit,
        knesset_num=knesset_num, date_from=date_from, date_to=date_to,
        is_accepted=is_accepted,
    )

    async def factory() -> dict:
        frames = await fetch_vote_data()
        df = frames.get("view_vote_rslts_hdr_approved", pd.DataFrame())
        if df.empty:
            return {"data": [], "pagination": {"page": page, "limit": limit, "total": 0, "total_pages": 0}, "cached_at": _now_iso()}

        if knesset_num is not None and "knesset_num" in df.columns:
            df = df[df["knesset_num"] == knesset_num]
        if date_from and "vote_date" in df.columns:
            df = df[df["vote_date"] >= date_from]
        if date_to and "vote_date" in df.columns:
            df = df[df["vote_date"] <= date_to]
        if is_accepted is not None and "is_accepted" in df.columns:
            df = df[df["is_accepted"] == is_accepted]

        # Sort by date descending
        if "vote_date" in df.columns:
            df = df.sort_values("vote_date", ascending=False)

        total = len(df)
        total_pages = math.ceil(total / limit) if total else 1
        offset = (page - 1) * limit
        page_df = df.iloc[offset: offset + limit]

        votes = [_row_to_vote(row) for _, row in page_df.iterrows()]
        return {
            "data": votes,
            "pagination": {"page": page, "limit": limit, "total": total, "total_pages": total_pages},
            "cached_at": _now_iso(),
        }

    return await cache.get_or_set(cache_key, factory, cache.TTL_VOTES_LIST, redis)


async def get_vote_detail(vote_id: int, redis: aioredis.Redis) -> dict | None:
    cache_key = f"votes:detail:{vote_id}"

    async def factory() -> dict | None:
        frames = await fetch_vote_data()
        hdr_df = frames.get("view_vote_rslts_hdr_approved", pd.DataFrame())
        mk_df = frames.get("view_vote_mk_individual", pd.DataFrame())

        if hdr_df.empty:
            return None

        id_col = "id" if "id" in hdr_df.columns else hdr_df.columns[0]
        rows = hdr_df[hdr_df[id_col] == vote_id]
        if rows.empty:
            return None

        base = _row_to_vote(rows.iloc[0])

        # Per-MK vote records
        mk_votes: list[dict] = []
        if not mk_df.empty and "vote_id" in mk_df.columns:
            mv = mk_df[mk_df["vote_id"] == vote_id]
            for _, mr in mv.iterrows():
                mk_votes.append({
                    "vote_id": vote_id,
                    "mk_individual_id": int(_safe(mr.get("mk_individual_id")) or 0),
                    "mk_name": _safe(mr.get("mk_individual_name", "")),
                    "mk_name_eng": _safe(mr.get("mk_individual_name_eng", "")),
                    "faction_id": int(_safe(mr.get("faction_id"))) if _safe(mr.get("faction_id")) else None,
                    "faction_name": _safe(mr.get("faction_name")),
                    "decision": _safe(mr.get("vote_decision", "absent")),
                    "vote_date": base["vote_date"],
                    "vote_item_dscr": base["vote_item_dscr"],
                })

        # Per-party breakdown
        party_breakdown: list[dict] = []
        if mk_votes and "faction_id" in (mk_df.columns if not mk_df.empty else []):
            mv_sub = mk_df[mk_df["vote_id"] == vote_id]
            if not mv_sub.empty:
                grouped = mv_sub.groupby("faction_id")
                for fid, grp in grouped:
                    fid_int = int(_safe(fid) or 0)
                    fname = _safe(grp.iloc[0].get("faction_name", "")) if not grp.empty else ""
                    party_breakdown.append({
                        "faction_id": fid_int,
                        "faction_name": fname,
                        "for_count": int((grp.get("vote_decision", pd.Series()) == "for").sum()),
                        "against_count": int((grp.get("vote_decision", pd.Series()) == "against").sum()),
                        "abstain_count": int((grp.get("vote_decision", pd.Series()) == "abstain").sum()),
                        "absent_count": int((grp.get("vote_decision", pd.Series()) == "absent").sum()),
                        "total_members": len(grp),
                    })

        return {**base, "party_breakdown": party_breakdown, "mk_votes": mk_votes}

    return await cache.get_or_set(cache_key, factory, cache.TTL_VOTE_DETAIL, redis)
