"""
Members service: builds MKProfile and MKStats from oknesset CSV data.
Joins mk_individual + factions + positions + photos on mk_individual_id.
"""
from __future__ import annotations

import logging
import math
from datetime import datetime, timezone
from typing import Any

import pandas as pd
import redis.asyncio as aioredis

from app.services import cache_service as cache
from app.services.oknesset_client import fetch_all_mk_data, fetch_vote_data

logger = logging.getLogger(__name__)

_CURRENT_KNESSET = 25  # Update as needed


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe(val: Any) -> Any:
    """Convert NaN/NaT to None for JSON serialisation."""
    if pd.isna(val):
        return None
    return val


async def _load_mk_frames() -> dict[str, pd.DataFrame]:
    return await fetch_all_mk_data()


def _build_profile(row: pd.Series, frames: dict[str, pd.DataFrame]) -> dict:
    mk_id = int(row["mk_individual_id"])

    # Faction history
    factions_df = frames.get("mk_individual_factions", pd.DataFrame())
    hist: list[dict] = []
    if not factions_df.empty and "mk_individual_id" in factions_df.columns:
        mk_factions = factions_df[factions_df["mk_individual_id"] == mk_id]
        for _, fr in mk_factions.iterrows():
            hist.append({
                "faction_id": int(_safe(fr.get("faction_id")) or 0),
                "faction_name": _safe(fr.get("faction_name", "")),
                "start_date": str(_safe(fr.get("start_date", ""))),
                "finish_date": str(_safe(fr.get("finish_date"))) if _safe(fr.get("finish_date")) else None,
                "knesset_num": int(_safe(fr.get("knesset_num")) or 0),
            })

    # Current faction (latest membership with no finish_date)
    current_faction = None
    current = [h for h in hist if h["finish_date"] is None]
    if current:
        latest = sorted(current, key=lambda h: h["start_date"], reverse=True)[0]
        current_faction = {
            "id": latest["faction_id"],
            "name": latest["faction_name"] or "",
            "knesset_num": latest["knesset_num"],
        }

    # Positions
    pos_df = frames.get("mk_individual_positions", pd.DataFrame())
    positions: list[dict] = []
    if not pos_df.empty and "mk_individual_id" in pos_df.columns:
        mk_pos = pos_df[pos_df["mk_individual_id"] == mk_id]
        for _, pr in mk_pos.iterrows():
            positions.append({
                "position_id": int(_safe(pr.get("position_id")) or 0),
                "position_name": _safe(pr.get("position_name", "")),
                "body_name": _safe(pr.get("body_name")),
                "start_date": str(_safe(pr.get("start_date"))) if _safe(pr.get("start_date")) else None,
                "finish_date": str(_safe(pr.get("finish_date"))) if _safe(pr.get("finish_date")) else None,
            })

    # Photo
    photo_df = frames.get("mk_individual_photo", pd.DataFrame())
    photo_url = None
    if not photo_df.empty and "mk_individual_id" in photo_df.columns:
        photos = photo_df[photo_df["mk_individual_id"] == mk_id]
        if not photos.empty:
            photo_url = _safe(photos.iloc[0].get("photo_url"))

    return {
        "mk_individual_id": mk_id,
        "mk_individual_name": _safe(row.get("mk_individual_name", "")),
        "mk_individual_name_eng": _safe(row.get("mk_individual_name_eng", "")),
        "mk_individual_first_name": _safe(row.get("mk_individual_first_name", "")),
        "mk_individual_first_name_eng": _safe(row.get("mk_individual_first_name_eng", "")),
        "mk_individual_photo": photo_url,
        "mk_individual_email": _safe(row.get("mk_individual_email")),
        "mk_individual_phone": None,
        "gender_desc": _safe(row.get("gender_desc", "")),
        "is_current": bool(_safe(row.get("is_current", False))),
        "knessets": [],
        "current_faction": current_faction,
        "faction_history": hist,
        "positions": positions,
    }


async def list_members(
    redis: aioredis.Redis,
    page: int = 1,
    limit: int = 20,
    search: str | None = None,
    faction_id: int | None = None,
    is_current: bool | None = None,
) -> dict:
    cache_key = cache.make_list_key(
        "members:list", page=page, limit=limit,
        search=search, faction_id=faction_id, is_current=is_current
    )

    async def factory() -> dict:
        frames = await _load_mk_frames()
        df = frames.get("mk_individual", pd.DataFrame())
        if df.empty:
            return {"data": [], "pagination": {"page": page, "limit": limit, "total": 0, "total_pages": 0}, "cached_at": _now_iso()}

        if search:
            mask = (
                df["mk_individual_name"].str.contains(search, na=False, case=False) |
                df["mk_individual_name_eng"].str.contains(search, na=False, case=False)
            )
            df = df[mask]

        if is_current is not None:
            df = df[df["is_current"] == is_current]

        if faction_id is not None:
            fac_df = frames.get("mk_individual_factions", pd.DataFrame())
            if not fac_df.empty:
                ids = fac_df[
                    (fac_df["faction_id"] == faction_id) & (fac_df["finish_date"].isna())
                ]["mk_individual_id"].unique()
                df = df[df["mk_individual_id"].isin(ids)]

        total = len(df)
        total_pages = math.ceil(total / limit) if total else 1
        offset = (page - 1) * limit
        page_df = df.iloc[offset: offset + limit]

        profiles = [_build_profile(row, frames) for _, row in page_df.iterrows()]
        return {
            "data": profiles,
            "pagination": {"page": page, "limit": limit, "total": total, "total_pages": total_pages},
            "cached_at": _now_iso(),
        }

    return await cache.get_or_set(cache_key, factory, cache.TTL_MK_LIST, redis)


async def get_member(mk_id: int, redis: aioredis.Redis) -> dict | None:
    cache_key = f"members:detail:{mk_id}"

    async def factory() -> dict | None:
        frames = await _load_mk_frames()
        df = frames.get("mk_individual", pd.DataFrame())
        if df.empty:
            return None
        rows = df[df["mk_individual_id"] == mk_id]
        if rows.empty:
            return None
        return _build_profile(rows.iloc[0], frames)

    return await cache.get_or_set(cache_key, factory, cache.TTL_BILL_DETAIL, redis)


async def get_member_stats(mk_id: int, redis: aioredis.Redis) -> dict | None:
    """
    Compute rebellion rate and attendance for an MK.
    Rebellion rate = % of votes where MK voted against their faction majority.
    """
    cache_key = f"members:stats:{mk_id}"

    async def factory() -> dict | None:
        vote_frames = await fetch_vote_data()
        mk_votes_df = vote_frames.get("view_vote_mk_individual", pd.DataFrame())
        hdr_df = vote_frames.get("view_vote_rslts_hdr_approved", pd.DataFrame())

        if mk_votes_df.empty:
            return None

        mk_rows = mk_votes_df[mk_votes_df["mk_individual_id"] == mk_id]
        if mk_rows.empty:
            return None

        total = len(mk_rows)
        for_count = int((mk_rows["vote_decision"] == "for").sum()) if "vote_decision" in mk_rows.columns else 0
        against_count = int((mk_rows["vote_decision"] == "against").sum()) if "vote_decision" in mk_rows.columns else 0
        abstain_count = int((mk_rows["vote_decision"] == "abstain").sum()) if "vote_decision" in mk_rows.columns else 0
        absent_count = total - for_count - against_count - abstain_count

        # Rebellion rate: simplified — % voted against own faction majority
        # Full computation requires per-vote faction majority → Phase 2 detail
        rebellion_rate = 0.0
        if total > 0 and "faction_position" in mk_rows.columns and "vote_decision" in mk_rows.columns:
            rebels = mk_rows[mk_rows["vote_decision"] != mk_rows["faction_position"]]
            rebellion_rate = round(len(rebels) / total, 4)

        return {
            "mk_individual_id": mk_id,
            "total_votes": total,
            "votes_for": for_count,
            "votes_against": against_count,
            "votes_abstain": abstain_count,
            "votes_absent": absent_count,
            "rebellion_rate": rebellion_rate,
            "attendance_rate": round((total - absent_count) / total, 4) if total else 0.0,
            "bills_proposed": 0,  # filled by bills_service in Phase 2
            "current_term_votes": total,
            "current_term_rebellion_rate": rebellion_rate,
        }

    return await cache.get_or_set(cache_key, factory, cache.TTL_MK_STATS, redis)
