from fastapi import APIRouter, HTTPException, Query
from app.deps import DbDep, RedisDep, SettingsDep
from app.services import votes_service

router = APIRouter()


@router.get("")
async def get_votes(
    db: DbDep,
    redis: RedisDep,
    settings: SettingsDep,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    knesset_num: int | None = None,
    date_from: str | None = Query(None, description="YYYY-MM-DD"),
    date_to: str | None = Query(None, description="YYYY-MM-DD"),
    is_accepted: bool | None = None,
):
    return await votes_service.list_votes(
        db,
        redis,
        page=page,
        limit=limit,
        knesset_num=knesset_num,
        date_from=date_from,
        date_to=date_to,
        is_accepted=is_accepted,
        current_knesset=settings.current_knesset,
    )


@router.get("/{vote_id}")
async def get_vote(vote_id: int, db: DbDep, redis: RedisDep):
    vote = await votes_service.get_vote_detail(vote_id, db, redis)
    if vote is None:
        raise HTTPException(status_code=404, detail=f"Vote {vote_id} not found")
    return vote
