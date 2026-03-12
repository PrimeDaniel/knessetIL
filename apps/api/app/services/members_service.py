"""
Members service -- corrected for real oknesset column names (verified 2026-03-12).

Real mk_individual.csv columns:
  mk_individual_id, mk_status_id, mk_individual_name, mk_individual_name_eng,
  mk_individual_first_name, mk_individual_first_name_eng, mk_individual_email,
  mk_individual_photo (URL direct), PersonID, LastName, FirstName, GenderID,
  GenderDesc, Email, IsCurrent (bool), LastUpdatedDate, altnames

Real mk_individual_factions.csv columns:
  mk_individual_id, faction_id, faction_name, start_date, finish_date, knesset

NOTE: mk_individual_positions.csv is currently empty (0 bytes) -- skipped.
NOTE: Photo URL is IN mk_individual.csv as 'mk_individual_photo' -- no separate file.
"""
from __future__ import annotations

import logging
import math
from datetime import datetime, timezone
from typing import Any

import pandas as pd
import redis.asyncio as aioredis

from app.services import cache_service as cache
from app.services.oknesset_client import fetch_all_mk_data

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


def _build_profile(row: pd.Series, factions_df: pd.DataFrame) -> dict:
    mk_id = int(row["mk_individual_id"])

    hist: list[dict] = []
    if not factions_df.empty:
        mk_factions = factions_df[factions_df["mk_individual_id"] == mk_id]
        for _, fr in mk_factions.iterrows():
            hist.append({
                "faction_id":   int(_safe(fr.get("faction_id")) or 0),
                "faction_name": _safe(fr.get("faction_name", "")),
                "start_date":   str(_safe(fr.get("start_date", ""))),
                "finish_date":  str(_safe(fr["finish_date"])) if _safe(fr.get("finish_date")) else None,
                "knesset_num":  int(_safe(fr.get("knesset")) or 0),
            })

    current_faction = None
    active = [h for h in hist if h["finish_date"] is None]
    if active:
        latest = max(active, key=lambda h: h["start_date"])
        current_faction = {"id": latest["faction_id"], "name": latest["faction_name"] or "", "knesset_num": latest["knesset_num"]}

    return {
        "mk_individual_id":             mk_id,
        "mk_individual_name":           _safe(row.get("mk_individual_name", "")),
        "mk_individual_name_eng":       _safe(row.get("mk_individual_name_eng", "")),
        "mk_individual_first_name":     _safe(row.get("mk_individual_first_name", "")),
        "mk_individual_first_name_eng": _safe(row.get("mk_individual_first_name_eng", "")),
        "mk_individual_photo":          _safe(row.get("mk_individual_photo")),
        "mk_individual_email":          _safe(row.get("mk_individual_email")) or _safe(row.get("Email")),
        "mk_individual_phone":          None,
        "gender_desc":                  _safe(row.get("GenderDesc", "")),
        "is_current":                   bool(_safe(row.get("IsCurrent", False))),
        "knessets":                     [],
        "current_faction":              current_faction,
        "faction_history":              hist,
        "positions":                    [],
    }


def _empty_page(page: int, limit: int) -> dict:
    return {"data": [], "pagination": {"page": page, "limit": limit, "total": 0, "total_pages": 0}, "cached_at": _now_iso()}


async def list_members(redis: aioredis.Redis, page: int = 1, limit: int = 20,
                       search: str | None = None, faction_id: int | None = None,
                       is_current: bool | None = None) -> dict:
    cache_key = cache.make_list_key("members:list", page=page, limit=limit,
                                    search=search, faction_id=faction_id, is_current=is_current)

    async def factory() -> dict:
        frames = await fetch_all_mk_data()
        df = frames.get("mk_individual", pd.DataFrame())
        factions_df = frames.get("mk_individual_factions", pd.DataFrame())
        if df.empty:
            return _empty_page(page, limit)

        if search:
            mask = (df["mk_individual_name"].str.contains(search, na=False, case=False) |
                    df["mk_individual_name_eng"].str.contains(search, na=False, case=False))
            df = df[mask]

        if is_current is not None and "IsCurrent" in df.columns:
            df = df[df["IsCurrent"] == is_current]

        if faction_id is not None and not factions_df.empty:
            mk_ids = factions_df[(factions_df["faction_id"] == faction_id) &
                                 (factions_df["finish_date"].isna())]["mk_individual_id"].unique()
            df = df[df["mk_individual_id"].isin(mk_ids)]

        total = len(df)
        total_pages = math.ceil(total / limit) if total else 1
        page_df = df.iloc[(page - 1) * limit: page * limit]
        return {
            "data": [_build_profile(row, factions_df) for _, row in page_df.iterrows()],
            "pagination": {"page": page, "limit": limit, "total": total, "total_pages": total_pages},
            "cached_at": _now_iso(),
        }

    return await cache.get_or_set(cache_key, factory, cache.TTL_MK_LIST, redis)


async def get_member(mk_id: int, redis: aioredis.Redis) -> dict | None:
    cache_key = f"members:detail:{mk_id}"

    async def factory() -> dict | None:
        frames = await fetch_all_mk_data()
        df = frames.get("mk_individual", pd.DataFrame())
        if df.empty:
            return None
        rows = df[df["mk_individual_id"] == mk_id]
        if rows.empty:
            return None
        return _build_profile(rows.iloc[0], frames.get("mk_individual_factions", pd.DataFrame()))

    return await cache.get_or_set(cache_key, factory, cache.TTL_BILL_DETAIL, redis)


async def get_member_stats(mk_id: int, redis: aioredis.Redis) -> dict | None:
    """
    Per-MK vote decisions are NOT in public oknesset CSVs.
    Returns available data only; rebellion_rate/attendance_rate are None.
    """
    cache_key = f"members:stats:{mk_id}"

    async def factory() -> dict | None:
        frames = await fetch_all_mk_data()
        df = frames.get("mk_individual", pd.DataFrame())
        if df.empty or df[df["mk_individual_id"] == mk_id].empty:
            return None
        return {
            "mk_individual_id": mk_id, "total_votes": 0,
            "votes_for": 0, "votes_against": 0, "votes_abstain": 0, "votes_absent": 0,
            "rebellion_rate": None, "attendance_rate": None,
            "bills_proposed": 0, "current_term_votes": 0, "current_term_rebellion_rate": None,
        }

    return await cache.get_or_set(cache_key, factory, cache.TTL_MK_STATS, redis)
