import math
import logging

from fastapi import APIRouter, HTTPException, Query, Request
from app.deps import RedisDep
from app.services import members_service
from app.services.oknesset_client import (
    V4_RESULT_CODE_MAP,
    fetch_v4,
    fetch_all_mk_data,
)

router = APIRouter()
logger = logging.getLogger(__name__)

_EMPTY_PAGE = lambda page, limit: {
    "data": [],
    "pagination": {"page": page, "limit": limit, "total": 0, "total_pages": 0},
}


@router.get("")
async def get_members(
    request: Request,
    redis: RedisDep,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: str | None = Query(None, description="Hebrew or English name search"),
    faction_id: int | None = None,
    knesset_num: int | None = None,
    is_current: bool | None = None,
):
    return await members_service.list_members(
        redis, page=page, limit=limit, search=search,
        faction_id=faction_id, is_current=is_current,
    )


@router.get("/{mk_id}")
async def get_member(mk_id: int, redis: RedisDep):
    mk = await members_service.get_member(mk_id, redis)
    if mk is None:
        raise HTTPException(status_code=404, detail=f"MK {mk_id} not found")
    return mk


@router.get("/{mk_id}/stats")
async def get_member_stats(mk_id: int, redis: RedisDep):
    """
    Compute per-MK vote stats from OData v4 for current Knesset 25 MKs.
    Falls back to zero-valued stats for historical MKs.
    """
    mk = await members_service.get_member(mk_id, redis)
    if mk is None:
        raise HTTPException(status_code=404, detail=f"MK {mk_id} not found")

    person_id = mk.get("person_id")
    is_current = mk.get("is_current", False)

    base = {
        "mk_individual_id": mk_id,
        "total_votes": 0,
        "votes_for": 0,
        "votes_against": 0,
        "votes_abstain": 0,
        "votes_absent": 0,
        "rebellion_rate": None,
        "attendance_rate": None,
        "bills_proposed": 0,
        "current_term_votes": 0,
        "current_term_rebellion_rate": None,
    }

    if not (is_current and person_id):
        return base

    try:
        # Fetch all vote results for this MK from OData v4 (follows pagination)
        from app.services.oknesset_client import fetch_v4_all
        rows = await fetch_v4_all(
            "KNS_PlenumVoteResult",
            params={"$filter": f"MkId eq {int(person_id)}"},
            timeout=60.0,
        )
    except Exception as exc:
        logger.warning("get_member_stats: OData v4 fetch failed for MK %d: %s", mk_id, exc)
        return base

    counts = {code: 0 for code in V4_RESULT_CODE_MAP.values()}
    for row in rows:
        decision = V4_RESULT_CODE_MAP.get(row.get("ResultCode", 6), "absent")
        counts[decision] = counts.get(decision, 0) + 1

    total = sum(counts.values())
    present = counts.get("for", 0) + counts.get("against", 0) + counts.get("abstain", 0)
    attendance = present / total if total else None

    return {
        **base,
        "total_votes": total,
        "votes_for": counts.get("for", 0),
        "votes_against": counts.get("against", 0),
        "votes_abstain": counts.get("abstain", 0),
        "votes_absent": counts.get("absent", 0),
        "attendance_rate": attendance,
        "current_term_votes": total,
    }


@router.get("/{mk_id}/votes")
async def get_member_votes(
    mk_id: int,
    redis: RedisDep,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=50),
):
    """
    Paginated list of votes cast by this MK with their personal decision.
    Current Knesset 25 MKs: sourced from OData v4 KNS_PlenumVoteResult.
    Historical MKs: not available (returns empty).
    """
    mk = await members_service.get_member(mk_id, redis)
    if mk is None:
        return _EMPTY_PAGE(page, limit)

    person_id = mk.get("person_id")
    is_current = mk.get("is_current", False)

    if not (is_current and person_id):
        return _EMPTY_PAGE(page, limit)

    skip = (page - 1) * limit
    try:
        results_data = await fetch_v4(
            "KNS_PlenumVoteResult",
            params={
                "$filter": f"MkId eq {int(person_id)}",
                "$orderby": "VoteDate desc",
                "$top": limit,
                "$skip": skip,
                "$count": "true",
            },
            timeout=30.0,
        )
    except Exception as exc:
        logger.error("get_member_votes: OData v4 failed for MK %d: %s", mk_id, exc)
        return _EMPTY_PAGE(page, limit)

    vote_results = results_data.get("value", [])
    total = int(results_data.get("@odata.count", 0))
    total_pages = math.ceil(total / limit) if total else 1

    # Fetch vote titles for this page's VoteIDs in a single request
    vote_ids = list({int(r["VoteID"]) for r in vote_results if r.get("VoteID")})
    vote_title_map: dict[int, str] = {}
    if vote_ids:
        id_filter = " or ".join(f"Id eq {vid}" for vid in vote_ids)
        try:
            headers = await fetch_v4("KNS_PlenumVote", params={"$filter": id_filter}, timeout=20.0)
            for h in headers.get("value", []):
                hid = h.get("Id")
                title = h.get("VoteTitle") or ""
                if hid:
                    vote_title_map[int(hid)] = title
        except Exception as exc:
            logger.warning("get_member_votes: failed to fetch vote titles: %s", exc)

    items = []
    for row in vote_results:
        vid = int(row.get("VoteID", 0))
        result_code = row.get("ResultCode", 6)
        decision = V4_RESULT_CODE_MAP.get(result_code, "absent")
        raw_date = str(row.get("VoteDate") or "")
        vote_date = raw_date[:10] if raw_date else ""

        items.append({
            "vote_id": vid,
            "vote_date": vote_date,
            "vote_item_dscr": vote_title_map.get(vid) or f"הצבעה #{vid}",
            "mk_decision": decision,
        })

    return {
        "data": items,
        "pagination": {"page": page, "limit": limit, "total": total, "total_pages": total_pages},
    }
