from fastapi import APIRouter, HTTPException, Query, Request
from app.deps import RedisDep
from app.services import votes_service

router = APIRouter()


@router.get("")
async def get_votes(
    request: Request,
    redis: RedisDep,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    knesset_num: int | None = None,
    date_from: str | None = Query(None, description="YYYY-MM-DD"),
    date_to: str | None = Query(None, description="YYYY-MM-DD"),
    is_accepted: bool | None = None,
):
    return await votes_service.list_votes(
        redis, page=page, limit=limit,
        knesset_num=knesset_num, date_from=date_from, date_to=date_to,
        is_accepted=is_accepted,
    )


@router.get("/{vote_id}")
async def get_vote(vote_id: int, redis: RedisDep):
    vote = await votes_service.get_vote_detail(vote_id, redis)
    if vote is None:
        raise HTTPException(status_code=404, detail=f"Vote {vote_id} not found")
    return vote
