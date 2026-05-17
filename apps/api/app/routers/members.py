import logging
import math

from fastapi import APIRouter, HTTPException, Query
from app.deps import DbDep, RedisDep
from app.services import members_service
from app.services.oknesset_client import V4_RESULT_CODE_MAP, fetch_v4, fetch_v4_all

router = APIRouter()
logger = logging.getLogger(__name__)


def _empty_page(page: int, limit: int) -> dict:
    return {
        "data": [],
        "pagination": {"page": page, "limit": limit, "total": 0, "total_pages": 0},
    }


@router.get("")
async def get_members(
    db: DbDep,
    redis: RedisDep,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=500),
    search: str | None = Query(None, description="Hebrew or English name search"),
    faction_id: int | None = None,
    knesset_num: int | None = None,
    is_current: bool | None = None,
):
    return await members_service.list_members(
        db,
        redis,
        page=page,
        limit=limit,
        search=search,
        faction_id=faction_id,
        is_current=is_current,
    )


@router.get("/{mk_id}")
async def get_member(mk_id: int, db: DbDep, redis: RedisDep):
    mk = await members_service.get_member(mk_id, db, redis)
    if mk is None:
        raise HTTPException(status_code=404, detail=f"MK {mk_id} not found")
    return mk


@router.get("/{mk_id}/stats")
async def get_member_stats(mk_id: int, db: DbDep, redis: RedisDep):
    """
    Vote stats from OData v4 for current Knesset 25 MKs.
    Returns zero-valued stats for historical MKs (OData v4 has no data for them).
    """
    mk = await members_service.get_member(mk_id, db, redis)
    if mk is None:
        raise HTTPException(status_code=404, detail=f"MK {mk_id} not found")

    base: dict = {
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

    person_id = mk.get("person_id")
    is_current = mk.get("is_current", False)
    if not (is_current and person_id):
        return base

    try:
        rows = await fetch_v4_all(
            "KNS_PlenumVoteResult",
            params={"$filter": f"MkId eq {int(person_id)}"},
            timeout=60.0,
        )
    except Exception as exc:
        logger.warning("get_member_stats: OData v4 fetch failed for MK %d: %s", mk_id, exc)
        return base

    counts: dict[str, int] = {"for": 0, "against": 0, "abstain": 0, "absent": 0}
    for row in rows:
        decision = V4_RESULT_CODE_MAP.get(row.get("ResultCode", 6), "absent")
        counts[decision] = counts.get(decision, 0) + 1

    total = sum(counts.values())
    present = counts["for"] + counts["against"] + counts["abstain"]
    return {
        **base,
        "total_votes": total,
        "votes_for": counts["for"],
        "votes_against": counts["against"],
        "votes_abstain": counts["abstain"],
        "votes_absent": counts["absent"],
        "attendance_rate": round(present / total, 4) if total else None,
        "current_term_votes": total,
    }


@router.get("/{mk_id}/votes")
async def get_member_votes(
    mk_id: int,
    db: DbDep,
    redis: RedisDep,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=50),
):
    """
    Paginated vote history for this MK with their personal decision.
    Current Knesset 25 MKs: sourced from OData v4.
    Historical MKs: not available via OData v4 (returns empty).
    """
    mk = await members_service.get_member(mk_id, db, redis)
    if mk is None:
        return _empty_page(page, limit)

    person_id = mk.get("person_id")
    is_current = mk.get("is_current", False)
    if not (is_current and person_id):
        return _empty_page(page, limit)

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
        return _empty_page(page, limit)

    vote_results = results_data.get("value", [])
    total = int(results_data.get("@odata.count", 0))
    total_pages = math.ceil(total / limit) if total else 1

    # Batch-fetch vote titles for this page's VoteIDs
    vote_ids = list({int(r["VoteID"]) for r in vote_results if r.get("VoteID")})
    vote_title_map: dict[int, str] = {}
    if vote_ids:
        id_filter = " or ".join(f"Id eq {vid}" for vid in vote_ids)
        try:
            headers = await fetch_v4("KNS_PlenumVote", params={"$filter": id_filter}, timeout=20.0)
            for h in headers.get("value", []):
                hid = h.get("Id")
                if hid:
                    vote_title_map[int(hid)] = h.get("VoteTitle") or ""
        except Exception as exc:
            logger.warning("get_member_votes: failed to fetch vote titles: %s", exc)

    items = [
        {
            "vote_id": int(row.get("VoteID", 0)),
            "vote_date": str(row.get("VoteDate") or "")[:10],
            "vote_item_dscr": vote_title_map.get(int(row.get("VoteID", 0)))
            or f"הצבעה #{row.get('VoteID')}",
            "mk_decision": V4_RESULT_CODE_MAP.get(row.get("ResultCode", 6), "absent"),
        }
        for row in vote_results
    ]

    return {
        "data": items,
        "pagination": {"page": page, "limit": limit, "total": total, "total_pages": total_pages},
    }
