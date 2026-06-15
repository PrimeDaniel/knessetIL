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
        "mk_individual_phone": member.phone,
        "gender_desc": member.gender_desc or "",
        "is_current": member.is_current,
        "is_coalition": member.is_coalition,
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


async def get_member_name_map() -> dict[str, dict]:
    """
    Build a ``"LastName_FirstName" -> {mk_individual_id, photo_url}`` lookup for
    every MK in the local table.

    The OData vote-result ``MkId`` is a *different* identifier from both
    ``person_id`` and ``mk_individual_id``, so it can't be used to link to a
    member page.  Instead we match on the MK's name — the same key the faction
    map (``fetch_v4_mk_faction_map``) already uses successfully — which lets vote
    views resolve each voter's profile link and photo.

    Current members win on name collisions (sorted so ``is_current`` overwrites
    last).  Keys are strings so the payload is JSON/JSONB-safe.
    """
    cache_key = "members:name_map"

    async def factory() -> dict[str, dict]:
        from app.database import AsyncSessionLocal

        async with AsyncSessionLocal() as db:
            rows = (
                await db.execute(
                    select(
                        Member.mk_individual_id,
                        Member.photo_url,
                        Member.first_name,
                        Member.last_name,
                        Member.is_current,
                    )
                )
            ).all()
        out: dict[str, dict] = {}
        for mk_id, photo, first, last, is_current in sorted(rows, key=lambda r: bool(r[4])):
            last_s = (last or "").strip()
            first_s = (first or "").strip()
            if not last_s and not first_s:
                continue
            out[f"{last_s}_{first_s}"] = {"mk_individual_id": mk_id, "photo_url": photo}
        return out

    return await cache.get_or_set(cache_key, factory, cache.TTL_MK_LIST)


async def get_member_faction_map() -> dict[str, dict]:
    """
    Build a "LastName_FirstName" -> {faction_id, faction_name} lookup
    for all members using the local database.
    """
    cache_key = "members:faction_map"

    async def factory() -> dict[str, dict]:
        from app.database import AsyncSessionLocal
        from datetime import date

        async with AsyncSessionLocal() as db:
            rows = (
                await db.execute(
                    select(
                        Member.first_name,
                        Member.last_name,
                        MemberFaction.faction_id,
                        MemberFaction.faction_name,
                        MemberFaction.finish_date,
                    )
                    .join(MemberFaction, Member.mk_individual_id == MemberFaction.mk_individual_id)
                )
            ).all()

        out: dict[str, dict] = {}
        # Sort so that rows with finish_date IS None (still active) are processed last,
        # overwriting older historical faction assignments.
        # Python's sorted() is stable.
        for first, last, faction_id, faction_name, finish_date in sorted(
            rows,
            key=lambda r: (r[4] is None, r[4] or date.min)
        ):
            last_s = (last or "").strip()
            first_s = (first or "").strip()
            if not last_s and not first_s:
                continue
            key = f"{last_s}_{first_s}"
            if faction_id is not None:
                out[key] = {
                    "faction_id": faction_id,
                    "faction_name": faction_name or "",
                }
        return out

    return await cache.get_or_set(cache_key, factory, cache.TTL_MK_LIST)
