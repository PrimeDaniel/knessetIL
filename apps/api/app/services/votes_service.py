"""
Votes service.

Data sources
============
* **Open Knesset CSVs** (frozen at Knesset 24, up to July 2021):
    view_vote_rslts_hdr_approved.csv columns (verified 2026-05-10):
      vote_id, knesset_num, session_id, sess_item_nbr, sess_item_id, sess_item_dscr,
      vote_item_id, vote_item_dscr, vote_date, vote_time, is_elctrnc_vote, vote_type,
      is_accepted (INTEGER 0/1), total_for, total_against, total_abstain,
      vote_stat, session_num, vote_nbr_in_sess, reason, modifier, remark

    vote_rslts_kmmbr_shadow.csv columns (~1.27 M rows):
      vote_id, kmmbr_id, kmmbr_name, vote_result, knesset_num, faction_id, faction_name
      vote_result: 1=for, 2=against, 3=abstain, 0=absent, 4=not_participating

* **Knesset OData v4** (live Knesset 25 / 26 data):
    KNS_PlenumVote        — vote header (Id, VoteDateTime, SessionID, ItemID, …)
    KNS_PlenumVoteResult  — per-MK results (ResultCode: 7=for, 8=against, 9=abstain, 6=absent)
    KNS_Person            — current MK roster
    KNS_PersonToPosition  — faction assignments

Routing logic
=============
* ``list_votes()``      — knesset_num is None or 25  → v4 path
                          knesset_num <= 24           → CSV path
* ``get_vote_detail()`` — vote_id > _V4_VOTE_ID_THRESHOLD → v4 path, else CSV
"""
from __future__ import annotations

import asyncio
import logging
import math
from datetime import datetime, timezone
from typing import Any

import pandas as pd
import redis.asyncio as aioredis

from app.services import cache_service as cache
from app.services.oknesset_client import (
    V4_RESULT_CODE_MAP,
    fetch_v4,
    fetch_v4_bill_item_ids,
    fetch_v4_mk_faction_map,
    fetch_v4_vote_results,
    fetch_v4_votes_page,
    fetch_vote_data,
    fetch_vote_mk_decisions,
)

logger = logging.getLogger(__name__)

# CSV vote_result integer codes → decision strings
_DECISION_MAP = {1: "for", 2: "against", 3: "abstain", 0: "absent", 4: "absent"}

# Vote IDs above this value are assumed to belong to Knesset 25+ (OData v4).
# The last vote in the K24 CSV dataset has an id in the low-30000s; we use a
# conservative threshold of 34,525 (value from the spec) to avoid ambiguity.
_V4_VOTE_ID_THRESHOLD = 34_525

# OData v4 cache TTLs
_TTL_V4_LIST   = 900    # 15 min — current sessions change frequently
_TTL_V4_DETAIL = 86_400  # 24 h   — a counted vote never changes
_TTL_V4_FK_MAP = 86_400  # 24 h   — faction roster stable within a term


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe(val: Any) -> Any:
    """Return *val* unchanged, or None when pandas considers it NA."""
    try:
        if pd.isna(val):
            return None
    except (TypeError, ValueError):
        pass
    return val


# ── CSV helpers ───────────────────────────────────────────────────────────────

def _row_to_vote(row: pd.Series) -> dict:
    """Convert a CSV row (pd.Series) to the canonical vote dict shape."""
    return {
        "id":              int(_safe(row.get("vote_id")) or 0),
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


# ── OData v4 helpers ──────────────────────────────────────────────────────────

def _parse_v4_datetime(dt_str: str | None) -> tuple[str, str | None]:
    """
    Parse an ISO-8601 string like ``"2024-03-18T16:30:00+02:00"`` into
    ``(vote_date, vote_time)`` matching the CSV field shape.

    Returns ``("", None)`` on parse failure.
    """
    if not dt_str:
        return "", None
    try:
        dt = datetime.fromisoformat(dt_str)
        return dt.strftime("%Y-%m-%d"), dt.strftime("%H:%M:%S")
    except ValueError:
        logger.warning("Could not parse VoteDateTime: %r", dt_str)
        return "", None


def _v4_row_to_vote(row: dict) -> dict:
    """
    Convert a single ``KNS_PlenumVote`` OData row to the canonical vote dict.

    Totals are initialised to 0; they must be filled in by a subsequent call to
    ``_compute_v4_totals()`` after the per-MK results have been fetched.
    """
    vote_date, vote_time = _parse_v4_datetime(row.get("VoteDateTime"))
    return {
        "id":             int(row.get("Id") or 0),
        "knesset_num":    25,
        "session_id":     int(row.get("SessionID") or 0),
        "vote_date":      vote_date,
        "vote_time":      vote_time,
        "vote_item_id":   int(row.get("ItemID") or 0),
        # Prefer VoteTitle; fall back to VoteSubject
        "vote_item_dscr": (row.get("VoteTitle") or row.get("VoteSubject") or "").strip(),
        "sess_item_dscr": (row.get("VoteSubject") or "").strip(),
        "vote_type":      0,
        "is_accepted":    False,  # filled in after totals are computed
        "total_for":      0,
        "total_against":  0,
        "total_abstain":  0,
        "total_absent":   0,
    }


def _compute_v4_totals(vote_dict: dict, results: list[dict]) -> dict:
    """
    Given the per-MK result rows for a vote, fill in aggregate totals and
    ``is_accepted`` in *vote_dict* (mutated in place and also returned).
    """
    for_count = against_count = abstain_count = absent_count = 0
    for r in results:
        code = int(r.get("ResultCode") or 0)
        decision = V4_RESULT_CODE_MAP.get(code, "absent")
        if decision == "for":
            for_count += 1
        elif decision == "against":
            against_count += 1
        elif decision == "abstain":
            abstain_count += 1
        else:
            absent_count += 1

    vote_dict["total_for"]     = for_count
    vote_dict["total_against"] = against_count
    vote_dict["total_abstain"] = abstain_count
    vote_dict["total_absent"]  = absent_count
    vote_dict["is_accepted"]   = for_count > against_count
    return vote_dict


def _build_mk_votes_and_breakdown(
    vote_id: int,
    vote_date: str,
    vote_item_dscr: str,
    results: list[dict],
    faction_map: dict[str, dict],
) -> tuple[list[dict], list[dict]]:
    """
    Convert raw ``KNS_PlenumVoteResult`` rows into the ``mk_votes`` and
    ``party_breakdown`` lists expected by ``VoteDetail``.

    ``faction_map`` is the name-keyed dict produced by
    ``fetch_v4_mk_faction_map()``.
    """
    mk_votes: list[dict] = []

    for r in results:
        last  = (r.get("LastName")  or "").strip()
        first = (r.get("FirstName") or "").strip()
        name_key = f"{last}_{first}"
        faction_info = faction_map.get(name_key, {})

        code = int(r.get("ResultCode") or 0)
        decision = V4_RESULT_CODE_MAP.get(code, "absent")

        mk_votes.append({
            "vote_id":          vote_id,
            "mk_individual_id": int(r.get("MkId") or 0),
            "mk_name":          f"{last} {first}".strip(),
            "mk_name_eng":      "",
            "faction_id":       faction_info.get("faction_id"),
            "faction_name":     faction_info.get("faction_name"),
            "decision":         decision,
            "vote_date":        vote_date,
            "vote_item_dscr":   vote_item_dscr,
        })

    # --- Aggregate party breakdown ---
    faction_accum: dict[int | None, dict] = {}
    for mv in mk_votes:
        fid = mv["faction_id"]
        if fid not in faction_accum:
            faction_accum[fid] = {
                "faction_id":    fid or 0,
                "faction_name":  mv["faction_name"] or "",
                "for_count":     0,
                "against_count": 0,
                "abstain_count": 0,
                "absent_count":  0,
                "total_members": 0,
            }
        entry = faction_accum[fid]
        entry["total_members"] += 1
        d = mv["decision"]
        if d == "for":
            entry["for_count"]     += 1
        elif d == "against":
            entry["against_count"] += 1
        elif d == "abstain":
            entry["abstain_count"] += 1
        else:
            entry["absent_count"]  += 1

    party_breakdown = sorted(
        faction_accum.values(),
        key=lambda x: x["for_count"] + x["against_count"] + x["abstain_count"],
        reverse=True,
    )

    return mk_votes, party_breakdown


# ── OData v4 service functions ────────────────────────────────────────────────

async def _get_mk_faction_map(redis: aioredis.Redis) -> dict[str, dict]:
    """Cached wrapper around ``fetch_v4_mk_faction_map()``."""
    cache_key = "votes:v4:mk_faction_map"

    async def factory() -> dict:
        return await fetch_v4_mk_faction_map()

    return await cache.get_or_set(cache_key, factory, _TTL_V4_FK_MAP, redis)


async def list_votes_v4(
    redis: aioredis.Redis,
    page: int = 1,
    limit: int = 20,
    is_accepted: bool | None = None,
) -> dict:
    """
    List votes from the Knesset OData v4 API (Knesset 25+, current data).

    For each vote on the page, the per-MK results are fetched in parallel so
    that aggregate totals (total_for, total_against, …) and ``is_accepted`` are
    computed correctly.  This means up to *limit* concurrent requests to the
    Knesset API on a cache miss — acceptable given that results are cached for
    15 minutes.

    If *is_accepted* is specified, filtering is applied **after** totals are
    computed.  This may result in fewer than *limit* items when the filter
    removes some votes; the pagination ``total`` reflects the unfiltered OData
    count.

    Returns a dict matching the ``VoteListResponse`` shape.
    """
    cache_key = cache.make_list_key(
        "votes:v4:list",
        page=page,
        limit=limit,
        is_accepted=is_accepted,
    )

    async def factory() -> dict:
        # 1. Fetch the page of vote headers
        envelope = await fetch_v4_votes_page(page=page, limit=limit)
        vote_rows = envelope.get("value", [])
        total = int(envelope.get("@odata.count") or 0)

        if not vote_rows:
            return {
                "data": [],
                "pagination": {
                    "page": page,
                    "limit": limit,
                    "total": total,
                    "total_pages": math.ceil(total / limit) if total else 1,
                },
                "cached_at": _now_iso(),
            }

        # 2. Fetch per-MK results for every vote in parallel
        vote_ids = [int(r.get("Id") or 0) for r in vote_rows]
        results_list: list[list[dict]] = await asyncio.gather(
            *[fetch_v4_vote_results(vid) for vid in vote_ids],
            return_exceptions=False,
        )

        # 3. Build vote dicts with computed totals
        votes: list[dict] = []
        for row, results in zip(vote_rows, results_list):
            vote_dict = _v4_row_to_vote(row)
            _compute_v4_totals(vote_dict, results)
            votes.append(vote_dict)

        # 4. Apply is_accepted filter if requested
        if is_accepted is not None:
            votes = [v for v in votes if v["is_accepted"] == is_accepted]

        total_pages = math.ceil(total / limit) if total else 1
        return {
            "data": votes,
            "pagination": {
                "page": page,
                "limit": limit,
                "total": total,
                "total_pages": total_pages,
            },
            "cached_at": _now_iso(),
        }

    return await cache.get_or_set(cache_key, factory, _TTL_V4_LIST, redis)


async def get_vote_detail_v4(vote_id: int, redis: aioredis.Redis) -> dict | None:
    """
    Fetch a full ``VoteDetail`` from the Knesset OData v4 API.

    Fetches the vote header, per-MK results, and the faction map concurrently,
    then assembles the canonical response shape.  Returns ``None`` if the vote
    is not found.
    """
    cache_key = f"votes:v4:detail:{vote_id}"

    async def factory() -> dict | None:
        # Fetch results and faction map concurrently; the vote header comes
        # bundled with the result set (we only need the KNS_PlenumVote row for
        # header fields not present in KNS_PlenumVoteResult).
        results, faction_map = await asyncio.gather(
            fetch_v4_vote_results(vote_id),
            _get_mk_faction_map(redis),
            return_exceptions=False,
        )

        if not results:
            # No results → vote doesn't exist in the v4 API
            logger.warning("get_vote_detail_v4: no results for vote_id=%d", vote_id)
            return None

        # Derive the vote header from the first result row (all share the same
        # SessionID, ItemID, VoteDate) and supplement with a KNS_PlenumVote
        # fetch for the title.
        first = results[0]
        vote_date_raw = (first.get("VoteDate") or "")
        # VoteDate in KNS_PlenumVoteResult is sometimes "YYYY-MM-DDT00:00:00"
        vote_date, _ = _parse_v4_datetime(vote_date_raw)
        if not vote_date and vote_date_raw:
            # Plain date string fallback (YYYY-MM-DD)
            vote_date = str(vote_date_raw)[:10]

        # Fetch the vote header for title/time — best-effort, non-fatal
        vote_time: str | None = None
        vote_item_dscr = ""
        sess_item_dscr = ""
        try:
            header_data = await fetch_v4(
                "KNS_PlenumVote",
                params={"$filter": f"Id eq {vote_id}"},
            )
            header_rows = header_data.get("value", [])
            if header_rows:
                h = header_rows[0]
                _, vote_time = _parse_v4_datetime(h.get("VoteDateTime"))
                vote_item_dscr = (h.get("VoteTitle") or h.get("VoteSubject") or "").strip()
                sess_item_dscr = (h.get("VoteSubject") or "").strip()
        except Exception as exc:
            logger.warning(
                "get_vote_detail_v4: could not fetch vote header for %d: %s", vote_id, exc
            )

        # Build the base dict
        vote_dict: dict = {
            "id":             vote_id,
            "knesset_num":    25,
            "session_id":     int(first.get("SessionID") or 0),
            "vote_date":      vote_date,
            "vote_time":      vote_time,
            "vote_item_id":   int(first.get("ItemID") or 0),
            "vote_item_dscr": vote_item_dscr,
            "sess_item_dscr": sess_item_dscr,
            "vote_type":      0,
            "is_accepted":    False,
            "total_for":      0,
            "total_against":  0,
            "total_abstain":  0,
            "total_absent":   0,
        }

        # Compute totals
        _compute_v4_totals(vote_dict, results)

        # Build per-MK and party breakdown
        mk_votes, party_breakdown = _build_mk_votes_and_breakdown(
            vote_id=vote_id,
            vote_date=vote_dict["vote_date"],
            vote_item_dscr=vote_dict["vote_item_dscr"],
            results=results,
            faction_map=faction_map,
        )

        vote_dict["mk_votes"]        = mk_votes
        vote_dict["party_breakdown"] = party_breakdown
        return vote_dict

    return await cache.get_or_set(cache_key, factory, _TTL_V4_DETAIL, redis)


# ── Public API (used by the router) ──────────────────────────────────────────

async def list_votes(
    redis: aioredis.Redis,
    page: int = 1,
    limit: int = 20,
    knesset_num: int | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    is_accepted: bool | None = None,
) -> dict:
    """
    List votes.  Routes to the OData v4 path for current data (Knesset 25+)
    and to the Open Knesset CSV path for historical data (Knesset ≤ 24).

    When *knesset_num* is ``None`` or ``25`` the v4 path is used.
    When *knesset_num* is ``24`` or lower the CSV path is used.

    Note: the v4 path does not support *date_from* / *date_to* server-side
    filtering for the list view (to keep the implementation simple and avoid
    extra round-trips).  These parameters are silently ignored for v4 requests.
    """
    # Route to OData v4 for Knesset 25+ (or when no specific knesset is asked)
    if knesset_num is None or knesset_num >= 25:
        return await list_votes_v4(redis, page=page, limit=limit, is_accepted=is_accepted)

    # ── Legacy CSV path (Knesset ≤ 24) ───────────────────────────────────────
    cache_key = cache.make_list_key(
        "votes:list",
        page=page,
        limit=limit,
        knesset_num=knesset_num,
        date_from=date_from,
        date_to=date_to,
        is_accepted=is_accepted,
    )

    async def csv_factory() -> dict:
        frames = await fetch_vote_data()
        df = frames.get("view_vote_rslts_hdr_approved", pd.DataFrame())
        if df.empty:
            return {
                "data": [],
                "pagination": {"page": page, "limit": limit, "total": 0, "total_pages": 0},
                "cached_at": _now_iso(),
            }

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
        page_df = df.iloc[(page - 1) * limit : page * limit]

        return {
            "data": [_row_to_vote(row) for _, row in page_df.iterrows()],
            "pagination": {
                "page": page,
                "limit": limit,
                "total": total,
                "total_pages": total_pages,
            },
            "cached_at": _now_iso(),
        }

    return await cache.get_or_set(cache_key, csv_factory, cache.TTL_VOTES_LIST, redis)


async def get_vote_detail(vote_id: int, redis: aioredis.Redis) -> dict | None:
    """
    Fetch the full detail for a single vote.

    Routes to OData v4 for vote IDs above ``_V4_VOTE_ID_THRESHOLD`` (Knesset
    25+ range), and falls back to the Open Knesset CSV for older IDs.

    If the v4 lookup returns ``None`` (vote not found in the live API), the
    function falls back to the CSV path so that edge-case IDs near the boundary
    still resolve.
    """
    if vote_id > _V4_VOTE_ID_THRESHOLD:
        result = await get_vote_detail_v4(vote_id, redis)
        if result is not None:
            return result
        # Fallthrough: try the CSV in case the threshold is off
        logger.info(
            "get_vote_detail: v4 returned None for vote_id=%d; trying CSV fallback", vote_id
        )

    # ── Legacy CSV path ───────────────────────────────────────────────────────
    cache_key = f"votes:detail:{vote_id}"

    async def csv_factory() -> dict | None:
        vote_frames, shadow_df = await asyncio.gather(
            fetch_vote_data(),
            fetch_vote_mk_decisions(),
            return_exceptions=False,
        )

        df = vote_frames.get("view_vote_rslts_hdr_approved", pd.DataFrame())
        if df.empty:
            return None

        rows = df[df["vote_id"] == vote_id]
        if rows.empty:
            return None

        base = _row_to_vote(rows.iloc[0])

        # --- Per-MK decisions from shadow CSV ---
        mk_rows = (
            shadow_df[shadow_df["vote_id"] == vote_id]
            if not shadow_df.empty
            else pd.DataFrame()
        )

        mk_votes: list[dict] = []
        for _, r in mk_rows.iterrows():
            result_int = int(_safe(r.get("vote_result")) or 0)
            mk_votes.append({
                "vote_id":          vote_id,
                "mk_individual_id": int(_safe(r.get("kmmbr_id")) or 0),
                "mk_name":          _safe(r.get("kmmbr_name", "")),
                "mk_name_eng":      "",
                "faction_id":       int(_safe(r.get("faction_id")) or 0),
                "faction_name":     _safe(r.get("faction_name", "")),
                "decision":         _DECISION_MAP.get(result_int, "absent"),
                "vote_date":        base["vote_date"],
                "vote_item_dscr":   base["vote_item_dscr"],
            })

        # --- Party breakdown grouped by faction ---
        party_breakdown: list[dict] = []
        if mk_votes:
            faction_accum: dict[int, dict] = {}
            for mv in mk_votes:
                fid = mv["faction_id"]
                if fid not in faction_accum:
                    faction_accum[fid] = {
                        "faction_id":    fid,
                        "faction_name":  mv["faction_name"] or "",
                        "for_count":     0,
                        "against_count": 0,
                        "abstain_count": 0,
                        "absent_count":  0,
                        "total_members": 0,
                    }
                entry = faction_accum[fid]
                entry["total_members"] += 1
                d = mv["decision"]
                if d == "for":
                    entry["for_count"]     += 1
                elif d == "against":
                    entry["against_count"] += 1
                elif d == "abstain":
                    entry["abstain_count"] += 1
                else:
                    entry["absent_count"]  += 1

            party_breakdown = sorted(
                faction_accum.values(),
                key=lambda x: x["for_count"] + x["against_count"] + x["abstain_count"],
                reverse=True,
            )

        base["party_breakdown"] = party_breakdown
        base["mk_votes"] = mk_votes
        return base

    return await cache.get_or_set(cache_key, csv_factory, cache.TTL_VOTE_DETAIL, redis)


async def get_votes_for_bill(bill_id: int, redis: aioredis.Redis) -> dict | None:
    """
    Find the most recent vote for a bill via the KNS_PlItem → KNS_PlenumVote chain.

    Lookup strategy (each step falls through to the next on failure):
      1. KNS_PlItem?$filter=BillID eq {bill_id}  → ItemID list
      2. KNS_PlenumVote?$filter=ItemID eq {item_id}  → vote headers (v4)
      3. Direct ItemID == BillID fallback (some IDs coincide by accident)
      4. CSV: filter view_vote_rslts_hdr_approved where vote_item_id in ItemIDs (K24)

    Returns a full ``VoteDetail`` dict or ``None`` if no vote is found.
    """
    cache_key = f"bills:votes:{bill_id}"

    async def factory() -> dict | None:
        # ── Step 1: bill → plenum item IDs ───────────────────────────────────
        item_ids = await fetch_v4_bill_item_ids(bill_id)

        # ── Step 2: plenum item IDs → vote rows (v4) ─────────────────────────
        vote_rows: list[dict] = []
        for item_id in item_ids:
            try:
                data = await fetch_v4(
                    "KNS_PlenumVote",
                    params={
                        "$filter": f"ItemID eq {item_id}",
                        "$orderby": "VoteDateTime desc",
                        "$top": "10",
                    },
                )
                vote_rows.extend(data.get("value", []))
            except Exception as exc:
                logger.warning(
                    "get_votes_for_bill: votes for item_id=%d failed: %s", item_id, exc
                )

        # ── Step 3: fallback — try BillID directly as ItemID ─────────────────
        if not vote_rows:
            try:
                data = await fetch_v4(
                    "KNS_PlenumVote",
                    params={
                        "$filter": f"ItemID eq {bill_id}",
                        "$orderby": "VoteDateTime desc",
                        "$top": "5",
                    },
                )
                vote_rows = data.get("value", [])
            except Exception:
                pass

        # ── Step 4: build VoteDetail from the best v4 vote ───────────────────
        if vote_rows:
            vote_rows.sort(key=lambda r: r.get("VoteDateTime") or "", reverse=True)
            vote_id = int(vote_rows[0].get("Id") or 0)
            if vote_id:
                return await get_vote_detail_v4(vote_id, redis)

        # ── Step 5: CSV fallback for K24 bills ───────────────────────────────
        if item_ids:
            vote_frames = await fetch_vote_data()
            csv_df = vote_frames.get("view_vote_rslts_hdr_approved", pd.DataFrame())
            if not csv_df.empty and "vote_item_id" in csv_df.columns:
                matching = csv_df[csv_df["vote_item_id"].isin(item_ids)]
                if not matching.empty:
                    latest = matching.sort_values("vote_date", ascending=False).iloc[0]
                    vote_id = int(_safe(latest.get("vote_id")) or 0)
                    if vote_id:
                        return await get_vote_detail(vote_id, redis)

        return None

    return await cache.get_or_set(cache_key, factory, _TTL_V4_DETAIL, redis)
