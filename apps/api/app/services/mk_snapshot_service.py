"""
MK Snapshot Service — permanent store of current Knesset 25 members.

Data source: https://www.knesset.gov.il/WebSiteApi/knessetapi/MkLobby/GetMkLobbyData?lang=he
Fields: MkId, Firstname, Lastname, FactionId, FactionName, ImagePath,
        Email, Phone, IsCoalition, IsPresent, GenderId, YearDate,
        Facebook, Twitter, Instegram, Youtube, WebsiteUrl

Storage (two-layer for permanence):
  1. JSON file: apps/api/data/knesset_mks.json
     — survives Redis flushes and server restarts; the true durable store
  2. Redis key: "mk:snapshot:current"  (no TTL — permanent until refresh)
     — fast access layer; warmed from file on startup

MkId from the Knesset lobby API equals PersonID in the Open Knesset CSV,
which is the same as KNS_Person.Id in OData v4.  We join on this key to
recover mk_individual_id (the Open Knesset internal ID used as our URL slug).
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
import pandas as pd
import redis.asyncio as aioredis

logger = logging.getLogger(__name__)

MK_LOBBY_URL = (
    "https://www.knesset.gov.il/WebSiteApi/knessetapi/MkLobby/GetMkLobbyData?lang=he"
)
REDIS_KEY = "mk:snapshot:current"
DATA_FILE = Path(__file__).resolve().parent.parent.parent / "data" / "knesset_mks.json"


def _safe(val: Any) -> Any:
    try:
        if pd.isna(val):
            return None
    except (TypeError, ValueError):
        pass
    return val


def _str(val: Any) -> str:
    return (val or "").strip()


async def _fetch_raw_mks() -> list[dict]:
    """GET the MkLobby JSON and return the raw 'mks' list."""
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        resp = await client.get(MK_LOBBY_URL)
        resp.raise_for_status()
    data = resp.json()
    mks = data.get("mks", [])
    logger.info("_fetch_raw_mks: got %d MKs from Knesset API", len(mks))
    return mks


async def _build_profiles(raw_mks: list[dict]) -> list[dict]:
    """
    Transform raw MkLobby rows into MKProfile-compatible dicts.
    Joins with the Open Knesset CSV on Hebrew name (MkLobby MkId ≠ CSV PersonID).
    """
    from app.services.oknesset_client import fetch_all_mk_data

    frames = await fetch_all_mk_data()
    csv_df = frames.get("mk_individual", pd.DataFrame())

    # Build (first_lower, last_lower) → (mk_individual_id, person_id) from current MKs in CSV.
    # MkLobby MkId is a different ID system from CSV PersonID, so we join on Hebrew names.
    name_to_ids: dict[tuple[str, str], tuple[int, int | None]] = {}
    if not csv_df.empty:
        curr_df = csv_df[csv_df["IsCurrent"] == True] if "IsCurrent" in csv_df.columns else csv_df
        for _, row in curr_df.iterrows():
            first = _str(_safe(row.get("mk_individual_first_name", "")))
            last  = _str(_safe(row.get("mk_individual_name", "")))
            if not (first and last):
                continue
            key = (first.lower(), last.lower())
            try:
                mk_id = int(row["mk_individual_id"])
                pid_raw = _safe(row.get("PersonID"))
                pid = int(float(pid_raw)) if pid_raw is not None else None
                name_to_ids[key] = (mk_id, pid)
            except (ValueError, TypeError):
                pass

    profiles: list[dict] = []
    missing: list[str] = []

    for mk in raw_mks:
        if mk.get("MkId") is None:
            continue

        first = _str(mk.get("Firstname"))
        last  = _str(mk.get("Lastname"))
        key = (first.lower(), last.lower())

        ids = name_to_ids.get(key)
        if ids is None:
            missing.append(f"{first} {last}")
            continue

        mk_individual_id, person_id = ids
        full_name = f"{first} {last}".strip() if first and last else first or last

        faction_id   = mk.get("FactionId")
        faction_name = _str(mk.get("FactionName"))

        profiles.append({
            "mk_individual_id":         mk_individual_id,
            "person_id":                person_id,  # CSV PersonID = OData KNS_Person.Id
            "mk_individual_name":       full_name,
            "mk_individual_first_name": first,
            "mk_individual_last_name":  last,
            "mk_individual_photo":      mk.get("ImagePath"),
            "mk_individual_email":      mk.get("Email") or None,
            "mk_individual_phone":      mk.get("Phone") or None,
            "gender_id":                mk.get("GenderId"),
            "birth_year":               mk.get("YearDate"),
            "is_coalition":             bool(mk.get("IsCoalition", False)),
            "is_present":               bool(mk.get("IsPresent", True)),
            "faction_id":               int(faction_id) if faction_id else None,
            "faction_name":             faction_name,
            "facebook":                 mk.get("Facebook") or None,
            "twitter":                  mk.get("Twitter") or None,
            "instagram":                mk.get("Instegram") or None,
            "youtube":                  mk.get("Youtube") or None,
            "website":                  mk.get("WebsiteUrl") or None,
            # MKProfile-compatible fields
            "mk_individual_name_eng":       "",
            "mk_individual_first_name_eng": "",
            "mk_individual_phone_number":   None,
            "gender_desc":                  "זכר" if mk.get("GenderId") == 1 else "נקבה",
            "is_current":                   True,
            "knessets":                     [25],
            "current_faction": {
                "id":          int(faction_id) if faction_id else 0,
                "name":        faction_name,
                "knesset_num": 25,
            } if faction_id else None,
            "faction_history": [],
            "positions":       [],
        })

    if missing:
        logger.warning(
            "_build_profiles: %d MKs had no CSV name match (names: %s) — skipped",
            len(missing), missing[:10],
        )

    logger.info("_build_profiles: built %d profiles", len(profiles))
    return profiles


async def fetch_and_store(redis: aioredis.Redis) -> list[dict]:
    """
    Full refresh: fetch from Knesset API → join CSV → persist to file + Redis.
    Call this on startup (if no snapshot exists) or via the /refresh endpoint.
    """
    raw_mks  = await _fetch_raw_mks()
    profiles = await _build_profiles(raw_mks)

    payload = {
        "mks": profiles,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "count": len(profiles),
    }

    # 1. Write JSON file (permanent, survives Redis restart)
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    with DATA_FILE.open("w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)
    logger.info("MK snapshot written to %s (%d members)", DATA_FILE, len(profiles))

    # 2. Store in Redis with no TTL (permanent until next refresh or FLUSHDB)
    try:
        await redis.set(REDIS_KEY, json.dumps(payload, ensure_ascii=False, default=str))
        logger.info("MK snapshot stored in Redis key '%s' (no TTL)", REDIS_KEY)
    except Exception as exc:
        logger.warning("Could not write MK snapshot to Redis: %s", exc)

    return profiles


async def get_snapshot(redis: aioredis.Redis) -> list[dict]:
    """
    Load snapshot with priority: Redis → file → fresh fetch.
    Never raises — returns [] on total failure.
    """
    # 1. Redis (fastest)
    try:
        cached = await redis.get(REDIS_KEY)
        if cached:
            data = json.loads(cached)
            mks = data.get("mks", [])
            if mks:
                logger.debug("MK snapshot loaded from Redis (%d members)", len(mks))
                return mks
    except Exception as exc:
        logger.warning("Redis read failed for MK snapshot: %s", exc)

    # 2. File (permanent on disk)
    if DATA_FILE.exists():
        try:
            with DATA_FILE.open("r", encoding="utf-8") as fh:
                data = json.load(fh)
            mks = data.get("mks", [])
            if mks:
                logger.info("MK snapshot loaded from file (%d members) — warming Redis", len(mks))
                try:
                    await redis.set(REDIS_KEY, json.dumps(data, ensure_ascii=False, default=str))
                except Exception:
                    pass
                return mks
        except Exception as exc:
            logger.warning("Failed to read MK snapshot file: %s", exc)

    # 3. Fresh fetch (no snapshot anywhere)
    logger.info("No MK snapshot found — fetching fresh from Knesset API")
    try:
        return await fetch_and_store(redis)
    except Exception as exc:
        logger.error("MK snapshot fetch failed: %s", exc)
        return []
