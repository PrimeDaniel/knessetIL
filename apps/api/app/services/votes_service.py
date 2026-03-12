"""
Votes service -- corrected for real schema (verified 2026-03-12).

Real view_vote_rslts_hdr_approved.csv columns:
  id, knesset_num, session_id, sess_item_nbr, sess_item_id, sess_item_dscr,
  vote_item_id, vote_item_dscr, vote_date, vote_time, is_elctrnc_vote, vote_type,
  is_accepted (INTEGER 0/1, NOT boolean), total_for, total_against, total_abstain,
  vote_stat, session_num, vote_nbr_in_sess, reason, modifier, remark

Real view_vote_mk_individual.csv (1,111 rows):
  vip_id, mk_individual_id, mk_individual_name, mk_individual_name_eng,
  mk_individual_first_name, mk_individual_first_name_eng
  -- This is a LOOKUP TABLE only (MK identifier mapping).
  -- Per-MK vote decisions (For/Against/Abstain) are NOT in the public CSV data.
  -- Party breakdown per vote is therefore NOT computable from CSVs.
"""
from __future__ import annotations

import logging
import math
from datetime import datetime, timezone
from typing import Any

import pandas as pd
import redis.asyncio as aioredis

from app.services import cache_service as cache
from app.services.oknesset_client import fetch_vote_data

logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe(val: Any) -> Any:
    try:
        if pd.isna(val):
            return None
    except (TypeError, ValueError):
        pass
    return val


def _row_to_vote(row: pd.Series) -> dict:
    return {
        "id":              int(_safe(row.get("id")) or 0),
        "knesset_num":     int(_safe(row.get("knesset_num")) or 0),
        "session_id":      int(_safe(row.get("session_id")) or 0),
        "vote_date":       str(_safe(row.get("vote_date", ""))),
        "vote_time":       _safe(row.get("vote_time")),
        "vote_item_id":    int(_safe(row.get("vote_item_id")) or 0),
        "vote_item_dscr":  _safe(row.get("vote_item_dscr", "")),
        "sess_item_dscr":  _safe(row.get("sess_item_dscr", "")),
        "vote_type":       int(_safe(row.get("vote_type")) or 0),
        # is_accepted is INTEGER 0/1 in CSV, cast to bool
        "is_accepted":     bool(int(_safe(row.get("is_accepted")) or 0)),
        "total_for":       int(_safe(row.get("total_for")) or 0),
        "total_against":   int(_safe(row.get("total_against")) or 0),
        "total_abstain":   int(_safe(row.get("total_abstain")) or 0),
        "total_absent":    0,  # not in CSV; computed as 120 - for - against - abstain if needed
    }


async def list_votes(redis: aioredis.Redis, page: int = 1, limit: int = 20,
                     knesset_num: int | None = None,
                     date_from: str | None = None, date_to: str | None = None,
                     is_accepted: bool | None = None) -> dict:
    cache_key = cache.make_list_key("votes:list", page=page, limit=limit,
                                    knesset_num=knesset_num, date_from=date_from,
                                    date_to=date_to, is_accepted=is_accepted)

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
            target = 1 if is_accepted else 0
            df = df[df["is_accepted"] == target]

        df = df.sort_values("vote_date", ascending=False)

        total = len(df)
        total_pages = math.ceil(total / limit) if total else 1
        page_df = df.iloc[(page - 1) * limit: page * limit]

        return {
            "data": [_row_to_vote(row) for _, row in page_df.iterrows()],
            "pagination": {"page": page, "limit": limit, "total": total, "total_pages": total_pages},
            "cached_at": _now_iso(),
        }

    return await cache.get_or_set(cache_key, factory, cache.TTL_VOTES_LIST, redis)


async def get_vote_detail(vote_id: int, redis: aioredis.Redis) -> dict | None:
    cache_key = f"votes:detail:{vote_id}"

    async def factory() -> dict | None:
        frames = await fetch_vote_data()
        df = frames.get("view_vote_rslts_hdr_approved", pd.DataFrame())
        if df.empty:
            return None

        rows = df[df["id"] == vote_id]
        if rows.empty:
            return None

        base = _row_to_vote(rows.iloc[0])
        # Per-MK decisions and party breakdown not available in CSV data
        base["party_breakdown"] = []
        base["mk_votes"] = []
        base["_note"] = "Per-MK vote decisions not available in public oknesset CSV data"
        return base

    return await cache.get_or_set(cache_key, factory, cache.TTL_VOTE_DETAIL, redis)
