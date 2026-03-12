"""
Parties (Factions) service -- corrected for real factions.csv schema.

Real factions.csv columns:
  id, name, start_date, finish_date, knessets (array like [25])

Real mk_individual_factions.csv columns:
  mk_individual_id, faction_id, faction_name, start_date, finish_date, knesset (int)
"""
from __future__ import annotations

import json
import logging
import math
from datetime import datetime, timezone
from typing import Any

import pandas as pd
import redis.asyncio as aioredis

from app.services import cache_service as cache
from app.services.oknesset_client import fetch_csv, fetch_all_mk_data

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


def _parse_knessets(raw: Any) -> list[int]:
    """Parse the 'knessets' column which comes as a JSON array string like '[25]'."""
    if raw is None:
        return []
    try:
        parsed = json.loads(str(raw))
        return [int(k) for k in parsed] if isinstance(parsed, list) else []
    except (json.JSONDecodeError, ValueError):
        return []


def _row_to_faction(row: pd.Series, factions_df: pd.DataFrame, knesset_num: int | None) -> dict:
    faction_id = int(_safe(row.get("id")) or 0)

    # Count current members from factions join table
    member_count = 0
    if not factions_df.empty and "faction_id" in factions_df.columns:
        active = factions_df[
            (factions_df["faction_id"] == faction_id) &
            (factions_df["finish_date"].isna())
        ]
        member_count = len(active)

    knessets = _parse_knessets(row.get("knessets"))

    return {
        "id":           faction_id,
        "name":         _safe(row.get("name", "")),
        "start_date":   str(_safe(row.get("start_date", ""))),
        "finish_date":  str(_safe(row["finish_date"])) if _safe(row.get("finish_date")) else None,
        "knessets":     knessets,
        "member_count": member_count,
        "cohesion_score": None,
    }


async def list_parties(redis: aioredis.Redis, knesset_num: int | None = None,
                       is_active: bool | None = None) -> dict:
    cache_key = cache.make_list_key("parties:list", knesset_num=knesset_num, is_active=is_active)

    async def factory() -> dict:
        fac_df = await fetch_csv("factions")
        mk_fac_frames = await fetch_all_mk_data()
        mk_factions_df = mk_fac_frames.get("mk_individual_factions", pd.DataFrame())

        if fac_df.empty:
            return {"data": [], "pagination": {"page": 1, "limit": 500, "total": 0, "total_pages": 0}, "cached_at": _now_iso()}

        if is_active is True and "finish_date" in fac_df.columns:
            fac_df = fac_df[fac_df["finish_date"].isna()]

        if knesset_num is not None and "knessets" in fac_df.columns:
            # Filter factions that include this knesset in their knessets array
            fac_df = fac_df[fac_df["knessets"].apply(
                lambda v: knesset_num in _parse_knessets(v)
            )]

        total = len(fac_df)
        factions = [_row_to_faction(row, mk_factions_df, knesset_num) for _, row in fac_df.iterrows()]

        return {
            "data": factions,
            "pagination": {"page": 1, "limit": total, "total": total, "total_pages": 1},
            "cached_at": _now_iso(),
        }

    return await cache.get_or_set(cache_key, factory, cache.TTL_PARTY_LIST, redis)


async def get_party_cohesion(faction_id: int, redis: aioredis.Redis) -> dict | None:
    """
    Cohesion cannot be computed from public CSV data (no per-MK vote decisions).
    Returns faction info with null cohesion_score and explanation.
    """
    cache_key = f"parties:cohesion:{faction_id}"

    async def factory() -> dict | None:
        fac_df = await fetch_csv("factions")
        if fac_df.empty:
            return None
        rows = fac_df[fac_df["id"] == faction_id]
        if rows.empty:
            return None
        row = rows.iloc[0]
        return {
            "faction_id":           faction_id,
            "faction_name":         _safe(row.get("name", "")),
            "cohesion_score":       None,
            "total_votes_analyzed": 0,
            "recent_cohesion":      [],
            "_note": "Cohesion computation requires per-MK vote decisions, not available in public CSV data",
        }

    return await cache.get_or_set(cache_key, factory, cache.TTL_PARTY_COH, redis)
