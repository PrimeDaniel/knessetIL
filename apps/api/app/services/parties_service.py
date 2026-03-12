"""
Parties (Factions) service.
Builds Faction list and computes cohesion score from vote data.
"""
from __future__ import annotations

import logging
import math
from datetime import datetime, timezone
from typing import Any

import pandas as pd
import redis.asyncio as aioredis

from app.services import cache_service as cache
from app.services.oknesset_client import fetch_csv, fetch_vote_data

logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe(val: Any) -> Any:
    if pd.isna(val):
        return None
    return val


async def list_parties(
    redis: aioredis.Redis,
    knesset_num: int | None = None,
    is_active: bool | None = None,
) -> dict:
    cache_key = cache.make_list_key("parties:list", knesset_num=knesset_num, is_active=is_active)

    async def factory() -> dict:
        df = await fetch_csv("factions")
        if df.empty:
            return {"data": [], "pagination": {"page": 1, "limit": 500, "total": 0, "total_pages": 0}, "cached_at": _now_iso()}

        if is_active is True and "finish_date" in df.columns:
            df = df[df["finish_date"].isna()]

        if knesset_num is not None:
            # factions.csv has knesset_num or start/finish year
            if "knesset_num" in df.columns:
                df = df[df["knesset_num"] == knesset_num]

        total = len(df)
        factions = []
        for _, row in df.iterrows():
            factions.append({
                "id": int(_safe(row.get("id")) or 0),
                "name": _safe(row.get("name", "")),
                "start_date": str(_safe(row.get("start_date", ""))),
                "finish_date": str(_safe(row.get("finish_date"))) if _safe(row.get("finish_date")) else None,
                "knessets": [],
                "member_count": int(_safe(row.get("member_count")) or 0),
                "cohesion_score": None,
            })

        return {
            "data": factions,
            "pagination": {"page": 1, "limit": total, "total": total, "total_pages": 1},
            "cached_at": _now_iso(),
        }

    return await cache.get_or_set(cache_key, factory, cache.TTL_PARTY_LIST, redis)


async def get_party_cohesion(faction_id: int, redis: aioredis.Redis) -> dict | None:
    """
    Compute party cohesion: for each vote, determine if the faction's members
    voted as a bloc. Cohesion = avg fraction of members voting with the majority.
    """
    cache_key = f"parties:cohesion:{faction_id}"

    async def factory() -> dict | None:
        frames = await fetch_vote_data()
        mk_df = frames.get("view_vote_mk_individual", pd.DataFrame())

        if mk_df.empty or "faction_id" not in mk_df.columns:
            return None

        faction_votes = mk_df[mk_df["faction_id"] == faction_id]
        if faction_votes.empty:
            return None

        fac_df = await fetch_csv("factions")
        faction_name = ""
        if not fac_df.empty:
            fac_rows = fac_df[fac_df["id"] == faction_id]
            if not fac_rows.empty:
                faction_name = _safe(fac_rows.iloc[0].get("name", ""))

        if "vote_id" not in faction_votes.columns or "vote_decision" not in faction_votes.columns:
            return {"faction_id": faction_id, "faction_name": faction_name,
                    "cohesion_score": 0.0, "total_votes_analyzed": 0, "recent_cohesion": []}

        cohesion_scores: list[float] = []
        recent: list[dict] = []

        for vote_id, grp in faction_votes.groupby("vote_id"):
            if len(grp) < 2:
                continue
            counts = grp["vote_decision"].value_counts()
            majority_count = int(counts.iloc[0]) if not counts.empty else 0
            cohesion = majority_count / len(grp)
            cohesion_scores.append(cohesion)

            if len(recent) < 20:
                recent.append({
                    "vote_date": str(_safe(grp.iloc[0].get("vote_date", ""))),
                    "cohesion": round(cohesion, 4),
                    "vote_item_dscr": _safe(grp.iloc[0].get("vote_item_dscr", "")),
                })

        avg_cohesion = round(sum(cohesion_scores) / len(cohesion_scores), 4) if cohesion_scores else 0.0

        return {
            "faction_id": faction_id,
            "faction_name": faction_name,
            "cohesion_score": avg_cohesion,
            "total_votes_analyzed": len(cohesion_scores),
            "recent_cohesion": recent,
        }

    return await cache.get_or_set(cache_key, factory, cache.TTL_PARTY_COH, redis)
