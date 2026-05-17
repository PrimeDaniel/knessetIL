from fastapi import APIRouter, HTTPException, Query
from app.deps import DbDep, RedisDep, SettingsDep
from app.services import bills_service, votes_service

router = APIRouter()


@router.get("")
async def get_bills(
    db: DbDep,
    redis: RedisDep,
    settings: SettingsDep,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: str | None = Query(None, description="Search in bill name (Hebrew or English)"),
    status_id: int | None = None,
    knesset_num: int | None = None,
    date_from: str | None = Query(None, description="YYYY-MM-DD"),
    date_to: str | None = Query(None, description="YYYY-MM-DD"),
):
    return await bills_service.list_bills(
        db,
        redis,
        page=page,
        limit=limit,
        search=search,
        status_id=status_id,
        knesset_num=knesset_num,
        date_from=date_from,
        date_to=date_to,
        current_knesset=settings.current_knesset,
    )


@router.get("/{bill_id}")
async def get_bill(bill_id: int, db: DbDep, redis: RedisDep):
    bill = await bills_service.get_bill(bill_id, db, redis)
    if bill is None:
        raise HTTPException(status_code=404, detail=f"Bill {bill_id} not found")
    return bill


@router.get("/{bill_id}/votes")
async def get_bill_votes(bill_id: int, db: DbDep, redis: RedisDep):
    """
    Returns the vote detail (party breakdown + MK-by-MK records) for a bill.
    Uses KNS_PlItem → KNS_PlenumVote chain to resolve bill → vote.
    """
    vote = await votes_service.get_votes_for_bill(bill_id, db, redis)
    if vote is None:
        raise HTTPException(status_code=404, detail=f"No vote data found for bill {bill_id}")
    return vote
