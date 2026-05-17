"""
Parties (Factions) service — SQLAlchemy-backed.

Cohesion score is computed from vote_decisions: for each vote a faction
participated in, a vote is "cohesive" when all members voted the same way.
Score = cohesive_votes / total_votes_with_participation.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

import redis.asyncio as aioredis
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db_models.faction import Faction
from app.db_models.member import Member, MemberFaction
from app.db_models.vote import VoteDecision
from app.services import cache_service as cache

logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _faction_to_dict(faction: Faction, member_count: int) -> dict:
    return {
        "id": faction.id,
        "name": faction.name,
        "start_date": faction.start_date.isoformat() if faction.start_date else "",
        "finish_date": faction.finish_date.isoformat() if faction.finish_date else None,
        "knessets": faction.knessets or [],
        "member_count": member_count,
        "cohesion_score": None,
    }


async def list_parties(
    db: AsyncSession,
    redis: aioredis.Redis,
    knesset_num: int | None = None,
    is_active: bool | None = None,
) -> dict:
    cache_key = cache.make_list_key("parties:list", knesset_num=knesset_num, is_active=is_active)

    async def factory() -> dict:
        stmt = select(Faction)

        if is_active is True:
            stmt = stmt.where(Faction.finish_date.is_(None))
        elif is_active is False:
            stmt = stmt.where(Faction.finish_date.is_not(None))

        if knesset_num is not None:
            # Filter factions that served in this knesset (PostgreSQL array contains)
            stmt = stmt.where(Faction.knessets.contains([knesset_num]))

        stmt = stmt.order_by(Faction.name)
        result = await db.execute(stmt)
        factions = result.scalars().all()

        # Count current members per faction (finish_date IS NULL in member_factions)
        faction_ids = [f.id for f in factions]
        counts_result = await db.execute(
            select(MemberFaction.faction_id, func.count().label("cnt"))
            .where(
                MemberFaction.faction_id.in_(faction_ids),
                MemberFaction.finish_date.is_(None),
            )
            .group_by(MemberFaction.faction_id)
        )
        member_counts: dict[int, int] = {row.faction_id: row.cnt for row in counts_result}

        data = [_faction_to_dict(f, member_counts.get(f.id, 0)) for f in factions]
        total = len(data)
        return {
            "data": data,
            "pagination": {"page": 1, "limit": total, "total": total, "total_pages": 1},
            "cached_at": _now_iso(),
        }

    return await cache.get_or_set(cache_key, factory, cache.TTL_PARTY_LIST, redis)


async def get_party_detail(faction_id: int, db: AsyncSession, redis: aioredis.Redis) -> dict | None:
    cache_key = f"parties:detail:{faction_id}"

    async def factory() -> dict | None:
        result = await db.execute(select(Faction).where(Faction.id == faction_id))
        faction = result.scalar_one_or_none()
        if faction is None:
            return None

        # Current members: join member_factions → members where finish_date IS NULL
        members_result = await db.execute(
            select(Member, MemberFaction)
            .join(MemberFaction, Member.mk_individual_id == MemberFaction.mk_individual_id)
            .where(
                MemberFaction.faction_id == faction_id,
                MemberFaction.finish_date.is_(None),
            )
            .order_by(Member.last_name, Member.first_name)
        )
        rows = members_result.all()

        members = [
            {
                "mk_individual_id": m.mk_individual_id,
                "mk_individual_name": m.full_name,
                "is_current": m.is_current,
                "rebellion_rate": None,
            }
            for m, _ in rows
        ]

        out = _faction_to_dict(faction, len(members))
        out["members"] = members
        return out

    return await cache.get_or_set(cache_key, factory, cache.TTL_PARTY_LIST, redis)


async def get_party_cohesion(
    faction_id: int, db: AsyncSession, redis: aioredis.Redis
) -> dict | None:
    cache_key = f"parties:cohesion:{faction_id}"

    async def factory() -> dict | None:
        result = await db.execute(select(Faction).where(Faction.id == faction_id))
        faction = result.scalar_one_or_none()
        if faction is None:
            return None

        # For each vote where this faction participated, check whether all members
        # voted the same way (ignoring absent/abstain for cohesion definition).
        # cohesion = votes where all participating members voted identically / total votes
        #
        # Step 1: get all (vote_id, result) pairs for this faction from vote_decisions
        decisions_result = await db.execute(
            select(VoteDecision.vote_id, VoteDecision.result).where(
                VoteDecision.faction_id == faction_id
            )
        )
        decisions = decisions_result.all()

        if not decisions:
            return {
                "faction_id": faction_id,
                "faction_name": faction.name,
                "cohesion_score": None,
                "total_votes_analyzed": 0,
                "recent_cohesion": [],
            }

        # Step 2: group by vote_id, collect unique results (excluding absent)
        from collections import defaultdict

        vote_results: dict[int, set[str]] = defaultdict(set)
        for row in decisions:
            if row.result != "absent":
                vote_results[row.vote_id].add(row.result)

        total_votes = len(vote_results)
        if total_votes == 0:
            cohesion_score = None
        else:
            # A vote is cohesive when all participating members cast the same non-absent vote
            cohesive = sum(1 for results in vote_results.values() if len(results) == 1)
            cohesion_score = round(cohesive / total_votes, 4)

        return {
            "faction_id": faction_id,
            "faction_name": faction.name,
            "cohesion_score": cohesion_score,
            "total_votes_analyzed": total_votes,
            "recent_cohesion": [],
        }

    return await cache.get_or_set(cache_key, factory, cache.TTL_PARTY_COH, redis)
