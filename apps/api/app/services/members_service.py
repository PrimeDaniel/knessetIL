"""
Members service — SQLAlchemy-backed.

Current and historical MKs are both served from the PostgreSQL `members` table,
kept fresh by the 6-hour CSV sync.  OData v4 calls for stats/vote-history
(current Knesset 25 only) remain in the members router.
"""

from __future__ import annotations

import logging
import math
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db_models.member import Member, MemberFaction
from app.services import cache_service as cache

logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _member_to_dict(member: Member, faction_rows: list[MemberFaction]) -> dict:
    hist = []
    for mf in sorted(faction_rows, key=lambda f: f.start_date or "", reverse=False):
        hist.append(
            {
                "faction_id": mf.faction_id,
                "faction_name": mf.faction_name or "",
                "start_date": mf.start_date.isoformat() if mf.start_date else "",
                "finish_date": mf.finish_date.isoformat() if mf.finish_date else None,
                "knesset_num": mf.knesset_num or 0,
            }
        )

    current_faction = None
    active = [h for h in hist if h["finish_date"] is None]
    if active:
        latest = max(active, key=lambda h: h["start_date"])
        current_faction = {
            "id": latest["faction_id"],
            "name": latest["faction_name"],
            "knesset_num": latest["knesset_num"],
        }

    knessets = sorted({h["knesset_num"] for h in hist if h["knesset_num"]})

    return {
        "mk_individual_id": member.mk_individual_id,
        "person_id": member.person_id,
        "mk_individual_name": member.full_name,
        "mk_individual_name_eng": member.full_name_eng,
        "mk_individual_first_name": member.first_name or "",
        "mk_individual_first_name_eng": member.first_name_eng or "",
        "mk_individual_photo": member.photo_url,
        "mk_individual_email": member.email,
        "mk_individual_phone": None,
        "gender_desc": member.gender_desc or "",
        "is_current": member.is_current,
        "knessets": knessets,
        "current_faction": current_faction,
        "faction_history": hist,
        "positions": [],
    }


async def list_members(
    db: AsyncSession,
    page: int = 1,
    limit: int = 20,
    search: str | None = None,
    faction_id: int | None = None,
    is_current: bool | None = None,
) -> dict:
    cache_key = cache.make_list_key(
        "members:list",
        page=page,
        limit=limit,
        search=search,
        faction_id=faction_id,
        is_current=is_current,
    )

    async def factory() -> dict:
        stmt = select(Member)

        if is_current is not None:
            stmt = stmt.where(Member.is_current == is_current)

        if search:
            term = f"%{search}%"
            stmt = stmt.where(
                Member.last_name.ilike(term)
                | Member.first_name.ilike(term)
                | Member.last_name_eng.ilike(term)
                | Member.first_name_eng.ilike(term)
            )

        if faction_id is not None:
            # Filter members whose current faction (finish_date IS NULL) matches
            current_mk_ids = select(MemberFaction.mk_individual_id).where(
                MemberFaction.faction_id == faction_id,
                MemberFaction.finish_date.is_(None),
            )
            stmt = stmt.where(Member.mk_individual_id.in_(current_mk_ids))

        count_result = await db.execute(select(func.count()).select_from(stmt.subquery()))
        total = count_result.scalar_one()

        stmt = stmt.order_by(Member.last_name, Member.first_name)
        stmt = stmt.offset((page - 1) * limit).limit(limit)
        result = await db.execute(stmt)
        members = result.scalars().all()

        # Batch-load faction histories for this page
        mk_ids = [m.mk_individual_id for m in members]
        factions_result = await db.execute(
            select(MemberFaction).where(MemberFaction.mk_individual_id.in_(mk_ids))
        )
        all_factions = factions_result.scalars().all()
        factions_by_mk: dict[int, list[MemberFaction]] = {}
        for mf in all_factions:
            factions_by_mk.setdefault(mf.mk_individual_id, []).append(mf)

        data = [_member_to_dict(m, factions_by_mk.get(m.mk_individual_id, [])) for m in members]
        total_pages = math.ceil(total / limit) if total else 1
        return {
            "data": data,
            "pagination": {
                "page": page,
                "limit": limit,
                "total": total,
                "total_pages": total_pages,
            },
            "cached_at": _now_iso(),
        }

    return await cache.get_or_set(cache_key, factory, cache.TTL_MK_LIST)


async def get_member(mk_id: int, db: AsyncSession) -> dict | None:
    cache_key = f"members:detail:{mk_id}"

    async def factory() -> dict | None:
        result = await db.execute(select(Member).where(Member.mk_individual_id == mk_id))
        member = result.scalar_one_or_none()
        if member is None:
            return None

        factions_result = await db.execute(
            select(MemberFaction).where(MemberFaction.mk_individual_id == mk_id)
        )
        faction_rows = factions_result.scalars().all()
        return _member_to_dict(member, list(faction_rows))

    return await cache.get_or_set(cache_key, factory, cache.TTL_MK_LIST)


async def count_current_members(db: AsyncSession) -> int:
    result = await db.execute(
        select(func.count()).where(Member.is_current == True)  # noqa: E712
    )
    return result.scalar_one() or 0
