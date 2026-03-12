from fastapi import APIRouter, HTTPException, Query, Request
from app.deps import RedisDep
from app.services import members_service

router = APIRouter()


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
    stats = await members_service.get_member_stats(mk_id, redis)
    if stats is None:
        raise HTTPException(status_code=404, detail=f"Stats for MK {mk_id} not found")
    return stats


@router.get("/{mk_id}/votes")
async def get_member_votes(
    mk_id: int,
    redis: RedisDep,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
):
    """Returns paginated list of votes cast by this MK."""
    from app.services.oknesset_client import fetch_vote_data
    import math
    from datetime import datetime, timezone

    frames = await fetch_vote_data()
    mk_df = frames.get("view_vote_mk_individual")
    if mk_df is None or mk_df.empty:
        return {"data": [], "pagination": {"page": page, "limit": limit, "total": 0, "total_pages": 0}}

    if "mk_individual_id" not in mk_df.columns:
        return {"data": [], "pagination": {"page": page, "limit": limit, "total": 0, "total_pages": 0}}

    rows = mk_df[mk_df["mk_individual_id"] == mk_id]
    total = len(rows)
    total_pages = math.ceil(total / limit) if total else 1
    offset = (page - 1) * limit
    page_rows = rows.iloc[offset: offset + limit]

    import pandas as pd
    def safe(v):
        return None if pd.isna(v) else v

    data = [
        {
            "vote_id": int(safe(r.get("vote_id")) or 0),
            "vote_date": str(safe(r.get("vote_date", ""))),
            "vote_item_dscr": safe(r.get("vote_item_dscr", "")),
            "decision": safe(r.get("vote_decision", "absent")),
            "faction_name": safe(r.get("faction_name")),
        }
        for _, r in page_rows.iterrows()
    ]
    return {
        "data": data,
        "pagination": {"page": page, "limit": limit, "total": total, "total_pages": total_pages},
        "cached_at": datetime.now(timezone.utc).isoformat(),
    }
