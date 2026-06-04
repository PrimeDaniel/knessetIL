"""
Votes service.

Routing:
  knesset_num is None or >= 25  →  OData v4 (live Knesset data)
  knesset_num <= 24             →  PostgreSQL vote_headers / vote_decisions tables

OData v4 result codes: 7=for, 8=against, 9=abstain, 6=absent
CSV result codes (stored in DB as strings): 'for', 'against', 'abstain', 'absent'

The vote_id threshold distinguishes K25 OData votes from K≤24 CSV votes:
vote IDs above _V4_VOTE_ID_THRESHOLD belong to Knesset 25+.
"""

from __future__ import annotations

import asyncio
import logging
import math
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db_models.vote import VoteHeader, VoteDecision
from app.services import cache_service as cache
from app.services.oknesset_client import (
    V4_RESULT_CODE_MAP,
    fetch_v4,
    fetch_v4_bill_item_ids,
    fetch_v4_mk_faction_map,
    fetch_v4_vote_with_results,
    fetch_v4_votes_page,
)

logger = logging.getLogger(__name__)

# Vote IDs above this belong to Knesset 25+ (OData v4 range)
_V4_VOTE_ID_THRESHOLD = 34_525

_TTL_V4_LIST = 900  # 15 min — current session votes change frequently
_TTL_V4_DETAIL = 86_400  # 24 h   — a counted vote never changes
_TTL_V4_FK_MAP = 86_400  # 24 h   — faction roster stable within a term


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _has_rows(result: dict) -> bool:
    """A list response worth caching has at least one row / a non-zero total."""
    return bool(result.get("data")) or result.get("pagination", {}).get("total", 0) > 0


# ── OData v4 helpers ──────────────────────────────────────────────────────────


def _parse_v4_datetime(dt_str: str | None) -> tuple[str, str | None]:
    if not dt_str:
        return "", None
    try:
        dt = datetime.fromisoformat(dt_str)
        return dt.strftime("%Y-%m-%d"), dt.strftime("%H:%M:%S")
    except ValueError:
        logger.warning("Could not parse VoteDateTime: %r", dt_str)
        return "", None


def _v4_row_to_vote(row: dict) -> dict:
    vote_date, vote_time = _parse_v4_datetime(row.get("VoteDateTime"))
    return {
        "id": int(row.get("Id") or 0),
        "knesset_num": 25,
        "session_id": int(row.get("SessionID") or 0),
        "vote_date": vote_date,
        "vote_time": vote_time,
        "vote_item_id": int(row.get("ItemID") or 0),
        "vote_item_dscr": (row.get("VoteTitle") or row.get("VoteSubject") or "").strip(),
        "sess_item_dscr": (row.get("VoteSubject") or "").strip(),
        "vote_type": 0,
        "is_accepted": False,
        "total_for": 0,
        "total_against": 0,
        "total_abstain": 0,
        "total_absent": 0,
    }


def _compute_v4_totals(vote_dict: dict, results: list[dict]) -> dict:
    counts: dict[str, int] = {"for": 0, "against": 0, "abstain": 0, "absent": 0}
    for r in results:
        decision = V4_RESULT_CODE_MAP.get(int(r.get("ResultCode") or 0), "absent")
        counts[decision] = counts.get(decision, 0) + 1
    vote_dict.update(
        {
            "total_for": counts["for"],
            "total_against": counts["against"],
            "total_abstain": counts["abstain"],
            "total_absent": counts["absent"],
            "is_accepted": counts["for"] > counts["against"],
        }
    )
    return vote_dict


def _build_party_breakdown(mk_votes: list[dict]) -> list[dict]:
    faction_accum: dict[int | None, dict] = {}
    for mv in mk_votes:
        fid = mv["faction_id"]
        if fid not in faction_accum:
            faction_accum[fid] = {
                "faction_id": fid or 0,
                "faction_name": mv["faction_name"] or "",
                "for_count": 0,
                "against_count": 0,
                "abstain_count": 0,
                "absent_count": 0,
                "total_members": 0,
            }
        entry = faction_accum[fid]
        entry["total_members"] += 1
        d = mv["decision"]
        if d == "for":
            entry["for_count"] += 1
        elif d == "against":
            entry["against_count"] += 1
        elif d == "abstain":
            entry["abstain_count"] += 1
        else:
            entry["absent_count"] += 1

    return sorted(
        faction_accum.values(),
        key=lambda x: x["for_count"] + x["against_count"] + x["abstain_count"],
        reverse=True,
    )


async def _get_mk_faction_map() -> dict[str, dict]:
    cache_key = "votes:v4:mk_faction_map"

    async def factory() -> dict:
        return await fetch_v4_mk_faction_map()

    return await cache.get_or_set(cache_key, factory, _TTL_V4_FK_MAP)


# ── OData v4 service functions ────────────────────────────────────────────────


async def list_votes_v4(
    page: int = 1,
    limit: int = 20,
    is_accepted: bool | None = None,
) -> dict:
    cache_key = cache.make_list_key(
        "votes:v4:list", page=page, limit=limit, is_accepted=is_accepted
    )

    async def factory() -> dict:
        envelope = await fetch_v4_votes_page(page=page, limit=limit)
        vote_rows = envelope.get("value", [])
        total = int(envelope.get("@odata.count") or 0)

        if not vote_rows:
            return {
                "data": [],
                "pagination": {"page": page, "limit": limit, "total": total, "total_pages": 1},
                "cached_at": _now_iso(),
            }

        votes: list[dict] = []
        for row in vote_rows:
            vote_dict = _v4_row_to_vote(row)
            _compute_v4_totals(vote_dict, row.get("VoteResults", []))
            votes.append(vote_dict)

        if is_accepted is not None:
            votes = [v for v in votes if v["is_accepted"] == is_accepted]

        return {
            "data": votes,
            "pagination": {
                "page": page,
                "limit": limit,
                "total": total,
                "total_pages": math.ceil(total / limit) if total else 1,
            },
            "cached_at": _now_iso(),
        }

    # Lazy cache: serve last-known data instantly, refresh live OData in the
    # background. `updating` tells the client to show a "מעדכן…" notice.
    # Never cache an empty result — that usually means a transient OData failure.
    result, updating = await cache.get_or_set_swr(
        cache_key, factory, _TTL_V4_LIST, cache_ok=_has_rows
    )
    return {**result, "updating": updating}


async def get_vote_detail_v4(vote_id: int) -> dict | None:
    cache_key = f"votes:v4:detail:{vote_id}"

    async def factory() -> dict | None:
        from app.services.members_service import get_member_name_map

        vote_row, faction_map, name_map = await asyncio.gather(
            fetch_v4_vote_with_results(vote_id),
            _get_mk_faction_map(),
            get_member_name_map(),
        )
        if not vote_row:
            return None

        results = vote_row.get("VoteResults", [])
        vote_date, vote_time = _parse_v4_datetime(vote_row.get("VoteDateTime"))
        vote_item_dscr = (vote_row.get("VoteTitle") or vote_row.get("VoteSubject") or "").strip()

        vote_dict: dict = {
            "id": vote_id,
            "knesset_num": 25,
            "session_id": int(vote_row.get("SessionID") or 0),
            "vote_date": vote_date,
            "vote_time": vote_time,
            "vote_item_id": int(vote_row.get("ItemID") or 0),
            "vote_item_dscr": vote_item_dscr,
            "sess_item_dscr": (vote_row.get("VoteSubject") or "").strip(),
            "vote_type": 0,
            "is_accepted": False,
            "total_for": 0,
            "total_against": 0,
            "total_abstain": 0,
            "total_absent": 0,
        }
        _compute_v4_totals(vote_dict, results)

        mk_votes: list[dict] = []
        for r in results:
            last = (r.get("LastName") or "").strip()
            first = (r.get("FirstName") or "").strip()
            name_key = f"{last}_{first}"
            faction_info = faction_map.get(name_key, {})
            decision = V4_RESULT_CODE_MAP.get(int(r.get("ResultCode") or 0), "absent")
            # Resolve the local mk_individual_id (used by member pages) + photo by
            # name — the vote-result MkId is a different id space and can't link.
            # mk_individual_id is 0 when unmatched; the UI then renders a non-link.
            minfo = name_map.get(name_key, {})
            mk_votes.append(
                {
                    "vote_id": vote_id,
                    "mk_individual_id": minfo.get("mk_individual_id") or 0,
                    "mk_name": f"{last} {first}".strip(),
                    "mk_name_eng": "",
                    "mk_individual_photo": minfo.get("photo_url"),
                    "faction_id": faction_info.get("faction_id"),
                    "faction_name": faction_info.get("faction_name"),
                    "decision": decision,
                    "vote_date": vote_dict["vote_date"],
                    "vote_item_dscr": vote_item_dscr,
                }
            )

        vote_dict["mk_votes"] = mk_votes
        vote_dict["party_breakdown"] = _build_party_breakdown(mk_votes)
        return vote_dict

    return await cache.get_or_set(cache_key, factory, _TTL_V4_DETAIL)


# ── PostgreSQL path (Knesset ≤ 24) ───────────────────────────────────────────


def _vote_header_to_dict(v: VoteHeader) -> dict:
    return {
        "id": v.vote_id,
        "knesset_num": v.knesset_num,
        "session_id": v.session_id,
        "vote_date": v.vote_date.isoformat() if v.vote_date else "",
        "vote_time": v.vote_time,
        "vote_item_id": v.vote_item_id,
        "vote_item_dscr": v.vote_item_dscr or "",
        "sess_item_dscr": v.sess_item_dscr or "",
        "vote_type": v.vote_type or 0,
        "is_accepted": v.is_accepted,
        "total_for": v.total_for,
        "total_against": v.total_against,
        "total_abstain": v.total_abstain,
        "total_absent": 0,
    }


async def list_votes_db(
    db: AsyncSession,
    page: int = 1,
    limit: int = 20,
    knesset_num: int | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    is_accepted: bool | None = None,
) -> dict:
    cache_key = cache.make_list_key(
        "votes:list",
        page=page,
        limit=limit,
        knesset_num=knesset_num,
        date_from=date_from,
        date_to=date_to,
        is_accepted=is_accepted,
    )

    async def factory() -> dict:
        stmt = select(VoteHeader)

        if knesset_num is not None:
            stmt = stmt.where(VoteHeader.knesset_num == knesset_num)
        if date_from:
            stmt = stmt.where(VoteHeader.vote_date >= date_from)
        if date_to:
            stmt = stmt.where(VoteHeader.vote_date <= date_to)
        if is_accepted is not None:
            stmt = stmt.where(VoteHeader.is_accepted == is_accepted)

        count_result = await db.execute(select(func.count()).select_from(stmt.subquery()))
        total = count_result.scalar_one()

        stmt = stmt.order_by(VoteHeader.vote_date.desc().nulls_last())
        stmt = stmt.offset((page - 1) * limit).limit(limit)
        result = await db.execute(stmt)
        votes = result.scalars().all()

        return {
            "data": [_vote_header_to_dict(v) for v in votes],
            "pagination": {
                "page": page,
                "limit": limit,
                "total": total,
                "total_pages": math.ceil(total / limit) if total else 1,
            },
            "cached_at": _now_iso(),
        }

    return await cache.get_or_set(cache_key, factory, cache.TTL_VOTES_LIST)


async def get_vote_detail_db(vote_id: int, db: AsyncSession) -> dict | None:
    cache_key = f"votes:detail:{vote_id}"

    async def factory() -> dict | None:
        result = await db.execute(select(VoteHeader).where(VoteHeader.vote_id == vote_id))
        header = result.scalar_one_or_none()
        if header is None:
            return None

        base = _vote_header_to_dict(header)

        decisions_result = await db.execute(
            select(VoteDecision).where(VoteDecision.vote_id == vote_id)
        )
        decisions = decisions_result.scalars().all()

        mk_votes = [
            {
                "vote_id": vote_id,
                "mk_individual_id": d.member_id,
                "mk_name": d.member_name or "",
                "mk_name_eng": "",
                "mk_individual_photo": None,
                "faction_id": d.faction_id,
                "faction_name": d.faction_name or "",
                "decision": d.result,
                "vote_date": base["vote_date"],
                "vote_item_dscr": base["vote_item_dscr"],
            }
            for d in decisions
        ]

        base["mk_votes"] = mk_votes
        base["party_breakdown"] = _build_party_breakdown(mk_votes)
        return base

    return await cache.get_or_set(cache_key, factory, cache.TTL_VOTE_DETAIL)


# ── Unified entry points ───────────────────────────────────────────────────────


async def list_votes(
    db: AsyncSession,
    page: int = 1,
    limit: int = 20,
    knesset_num: int | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    is_accepted: bool | None = None,
    current_knesset: int = 25,
) -> dict:
    if knesset_num is None or knesset_num >= current_knesset:
        return await list_votes_v4(page=page, limit=limit, is_accepted=is_accepted)
    return await list_votes_db(
        db,
        page=page,
        limit=limit,
        knesset_num=knesset_num,
        date_from=date_from,
        date_to=date_to,
        is_accepted=is_accepted,
    )


async def get_vote_detail(
    vote_id: int,
    db: AsyncSession,
) -> dict | None:
    if vote_id > _V4_VOTE_ID_THRESHOLD:
        result = await get_vote_detail_v4(vote_id)
        if result is not None:
            return result
        logger.info("get_vote_detail: v4 returned None for vote_id=%d, trying DB", vote_id)

    return await get_vote_detail_db(vote_id, db)


async def get_votes_for_bill(bill_id: int, db: AsyncSession) -> dict | None:
    cache_key = f"bills:votes:{bill_id}"

    async def factory() -> dict | None:
        item_ids = await fetch_v4_bill_item_ids(bill_id)

        # Step 1: try OData v4 (covers K25)
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
                logger.warning("get_votes_for_bill: item_id=%d failed: %s", item_id, exc)

        if vote_rows:
            vote_rows.sort(key=lambda r: r.get("VoteDateTime") or "", reverse=True)
            vote_id = int(vote_rows[0].get("Id") or 0)
            if vote_id:
                return await get_vote_detail_v4(vote_id)

        # Step 2: PostgreSQL fallback for K≤24 bills
        if item_ids:
            result = await db.execute(
                select(VoteHeader)
                .where(VoteHeader.vote_item_id.in_(item_ids))
                .order_by(VoteHeader.vote_date.desc())
                .limit(1)
            )
            header = result.scalar_one_or_none()
            if header is not None:
                return await get_vote_detail_db(header.vote_id, db)

        return None

    return await cache.get_or_set(cache_key, factory, _TTL_V4_DETAIL)
