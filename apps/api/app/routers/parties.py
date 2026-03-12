from fastapi import APIRouter, HTTPException, Query, Request
from app.deps import RedisDep
from app.services import parties_service

router = APIRouter()


@router.get("")
async def get_parties(
    request: Request,
    redis: RedisDep,
    knesset_num: int | None = None,
    is_active: bool | None = None,
):
    return await parties_service.list_parties(redis, knesset_num=knesset_num, is_active=is_active)


@router.get("/{faction_id}")
async def get_party(faction_id: int, redis: RedisDep):
    result = await parties_service.list_parties(redis)
    for faction in result.get("data", []):
        if faction["id"] == faction_id:
            return faction
    raise HTTPException(status_code=404, detail=f"Faction {faction_id} not found")


@router.get("/{faction_id}/cohesion")
async def get_party_cohesion(faction_id: int, redis: RedisDep):
    cohesion = await parties_service.get_party_cohesion(faction_id, redis)
    if cohesion is None:
        raise HTTPException(status_code=404, detail=f"Cohesion data for faction {faction_id} not found")
    return cohesion
