from fastapi import APIRouter, HTTPException
from app.deps import DbDep, RedisDep
from app.services import parties_service

router = APIRouter()


@router.get("")
async def get_parties(
    db: DbDep,
    redis: RedisDep,
    knesset_num: int | None = None,
    is_active: bool | None = None,
):
    return await parties_service.list_parties(
        db, redis, knesset_num=knesset_num, is_active=is_active
    )


@router.get("/{faction_id}")
async def get_party(faction_id: int, db: DbDep, redis: RedisDep):
    faction = await parties_service.get_party_detail(faction_id, db, redis)
    if faction is None:
        raise HTTPException(status_code=404, detail=f"Faction {faction_id} not found")
    return faction


@router.get("/{faction_id}/cohesion")
async def get_party_cohesion(faction_id: int, db: DbDep, redis: RedisDep):
    cohesion = await parties_service.get_party_cohesion(faction_id, db, redis)
    if cohesion is None:
        raise HTTPException(status_code=404, detail=f"Faction {faction_id} not found")
    return cohesion
