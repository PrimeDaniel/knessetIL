from fastapi import APIRouter, HTTPException
from app.deps import DbDep
from app.services import parties_service

router = APIRouter()


@router.get("")
async def get_parties(
    db: DbDep,
    knesset_num: int | None = None,
    is_active: bool | None = None,
):
    return await parties_service.list_parties(db, knesset_num=knesset_num, is_active=is_active)


@router.get("/{faction_id}")
async def get_party(faction_id: int, db: DbDep):
    faction = await parties_service.get_party_detail(faction_id, db)
    if faction is None:
        raise HTTPException(status_code=404, detail=f"Faction {faction_id} not found")
    return faction


@router.get("/{faction_id}/cohesion")
async def get_party_cohesion(faction_id: int, db: DbDep):
    cohesion = await parties_service.get_party_cohesion(faction_id, db)
    if cohesion is None:
        raise HTTPException(status_code=404, detail=f"Faction {faction_id} not found")
    return cohesion
