"""
Background sync task — runs every 6 hours (configured in main.py).

Flow per run:
  1. Download each CSV from oknesset.org
  2. UPSERT rows into PostgreSQL (ON CONFLICT DO UPDATE / DO NOTHING)
  3. Invalidate stale Redis response-cache keys

vote_rslts_kmmbr_shadow (~1.27M rows) uses ON CONFLICT DO NOTHING because
historical vote decisions never change once recorded. The first sync loads
all rows; subsequent syncs skip existing ones cheaply.
"""

import json
import logging
from datetime import date, datetime, timezone
from typing import Any

import pandas as pd
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.db_models.bill import Bill, BillInitiator
from app.db_models.faction import Faction
from app.db_models.member import Member, MemberFaction
from app.db_models.vote import VoteDecision, VoteHeader, VOTE_RESULT_MAP
from app.deps import get_redis_client
from app.services.cache_service import invalidate_many
from app.services.oknesset_client import fetch_csv

logger = logging.getLogger(__name__)

_UPSERT_BATCH = 2_000  # rows per INSERT statement
_NOW = datetime.now(timezone.utc)


def _safe(val: Any) -> Any:
    """Return val, or None if pandas considers it NA."""
    try:
        if pd.isna(val):
            return None
    except (TypeError, ValueError):
        pass
    return val


def _to_date(val: Any) -> date | None:
    """Parse a CSV date value to Python date, or None on failure."""
    v = _safe(val)
    if v is None:
        return None
    try:
        return pd.Timestamp(v).date()
    except Exception:
        return None


def _to_int(val: Any) -> int | None:
    v = _safe(val)
    if v is None:
        return None
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return None


def _to_bool(val: Any) -> bool:
    v = _safe(val)
    if v is None:
        return False
    if isinstance(v, bool):
        return v
    try:
        return bool(int(float(v)))
    except (TypeError, ValueError):
        return False


async def _upsert_batched(session: AsyncSession, stmt_factory, rows: list[dict]) -> int:
    """Execute batched UPSERT statements; returns total rows sent."""
    total = 0
    for i in range(0, len(rows), _UPSERT_BATCH):
        batch = rows[i : i + _UPSERT_BATCH]
        await session.execute(stmt_factory(batch))
        total += len(batch)
    return total


# ── Per-dataset sync functions ────────────────────────────────────────────────


async def _sync_members(session: AsyncSession) -> int:
    df = await fetch_csv("mk_individual")
    rows = []
    for _, r in df.iterrows():
        mk_id = _to_int(r.get("mk_individual_id"))
        if mk_id is None:
            continue
        rows.append(
            {
                "mk_individual_id": mk_id,
                "person_id": _to_int(r.get("PersonID")),
                "last_name": _safe(r.get("mk_individual_name")),
                "last_name_eng": _safe(r.get("mk_individual_name_eng")),
                "first_name": _safe(r.get("mk_individual_first_name")),
                "first_name_eng": _safe(r.get("mk_individual_first_name_eng")),
                "photo_url": _safe(r.get("mk_individual_photo")),
                "email": _safe(r.get("mk_individual_email")) or _safe(r.get("Email")),
                "gender_desc": _safe(r.get("GenderDesc")),
                "is_current": _to_bool(r.get("IsCurrent")),
                "synced_at": _NOW,
            }
        )

    def stmt_factory(batch):
        stmt = pg_insert(Member).values(batch)
        return stmt.on_conflict_do_update(
            index_elements=["mk_individual_id"],
            set_={c: stmt.excluded[c] for c in batch[0] if c != "mk_individual_id"},
        )

    return await _upsert_batched(session, stmt_factory, rows)


async def _sync_member_factions(session: AsyncSession) -> int:
    df = await fetch_csv("mk_individual_factions")
    rows = []
    for _, r in df.iterrows():
        mk_id = _to_int(r.get("mk_individual_id"))
        fac_id = _to_int(r.get("faction_id"))
        start = _to_date(r.get("start_date"))
        if mk_id is None or fac_id is None:
            continue
        rows.append(
            {
                "mk_individual_id": mk_id,
                "faction_id": fac_id,
                "faction_name": _safe(r.get("faction_name")),
                "start_date": start,
                "finish_date": _to_date(r.get("finish_date")),
                "knesset_num": _to_int(r.get("knesset")),
                "synced_at": _NOW,
            }
        )

    def stmt_factory(batch):
        stmt = pg_insert(MemberFaction).values(batch)
        return stmt.on_conflict_do_update(
            constraint="uq_member_faction_start",
            set_={
                c: stmt.excluded[c]
                for c in batch[0]
                if c not in ("mk_individual_id", "faction_id", "start_date")
            },
        )

    return await _upsert_batched(session, stmt_factory, rows)


async def _sync_factions(session: AsyncSession) -> int:
    df = await fetch_csv("factions")
    rows = []
    for _, r in df.iterrows():
        fac_id = _to_int(r.get("id"))
        if fac_id is None:
            continue
        # Parse '[24, 25]' JSON string → list[int]
        raw_knessets = _safe(r.get("knessets"))
        try:
            knessets = [int(k) for k in json.loads(str(raw_knessets))] if raw_knessets else []
        except (json.JSONDecodeError, ValueError):
            knessets = []
        rows.append(
            {
                "id": fac_id,
                "name": str(_safe(r.get("name")) or ""),
                "start_date": _to_date(r.get("start_date")),
                "finish_date": _to_date(r.get("finish_date")),
                "knessets": knessets,
                "synced_at": _NOW,
            }
        )

    def stmt_factory(batch):
        stmt = pg_insert(Faction).values(batch)
        return stmt.on_conflict_do_update(
            index_elements=["id"],
            set_={c: stmt.excluded[c] for c in batch[0] if c != "id"},
        )

    return await _upsert_batched(session, stmt_factory, rows)


async def _sync_bills(session: AsyncSession) -> int:
    df = await fetch_csv("kns_bill", timeout=120.0)
    rows = []
    for _, r in df.iterrows():
        bill_id = _to_int(r.get("BillID"))
        knesset_num = _to_int(r.get("KnessetNum"))
        if bill_id is None or knesset_num is None:
            continue
        rows.append(
            {
                "bill_id": bill_id,
                "knesset_num": knesset_num,
                "name": _safe(r.get("Name")),
                "sub_type_id": _to_int(r.get("SubTypeID")),
                "sub_type_desc": _safe(r.get("SubTypeDesc")),
                "status_id": _to_int(r.get("StatusID")),
                "private_number": _to_int(r.get("PrivateNumber")),
                "publication_date": _to_date(r.get("PublicationDate")),
                "is_continuation": _to_bool(r.get("IsContinuationBill")),
                "summary_law": _safe(r.get("SummaryLaw")),
                "synced_at": _NOW,
            }
        )

    def stmt_factory(batch):
        stmt = pg_insert(Bill).values(batch)
        return stmt.on_conflict_do_update(
            index_elements=["bill_id"],
            set_={c: stmt.excluded[c] for c in batch[0] if c != "bill_id"},
        )

    return await _upsert_batched(session, stmt_factory, rows)


async def _sync_bill_initiators(session: AsyncSession) -> int:
    df = await fetch_csv("kns_billinitiator")
    rows = []
    for _, r in df.iterrows():
        bill_id = _to_int(r.get("BillID"))
        person_id = _to_int(r.get("PersonID"))
        if bill_id is None or person_id is None:
            continue
        if not _to_bool(r.get("IsInitiator", True)):
            continue
        rows.append(
            {
                "bill_id": bill_id,
                "person_id": person_id,
                "is_initiator": True,
                "ordinal": _to_int(r.get("Ordinal")),
                "synced_at": _NOW,
            }
        )

    if not rows:
        return 0

    def stmt_factory(batch):
        # No natural unique key — use insert-or-skip on (bill_id, person_id)
        stmt = pg_insert(BillInitiator).values(batch)
        return stmt.on_conflict_do_nothing()

    return await _upsert_batched(session, stmt_factory, rows)


async def _sync_vote_headers(session: AsyncSession) -> int:
    df = await fetch_csv("view_vote_rslts_hdr_approved")
    rows = []
    for _, r in df.iterrows():
        vote_id = _to_int(r.get("vote_id"))
        if vote_id is None:
            continue
        rows.append(
            {
                "vote_id": vote_id,
                "knesset_num": _to_int(r.get("knesset_num")),
                "session_id": _to_int(r.get("session_id")),
                "sess_item_dscr": _safe(r.get("sess_item_dscr")),
                "vote_item_id": _to_int(r.get("vote_item_id")),
                "vote_item_dscr": _safe(r.get("vote_item_dscr")),
                "vote_date": _to_date(r.get("vote_date")),
                "vote_time": str(_safe(r.get("vote_time")) or "")[:8] or None,
                "vote_type": _to_int(r.get("vote_type")),
                "is_accepted": _to_bool(r.get("is_accepted")),
                "total_for": _to_int(r.get("total_for")) or 0,
                "total_against": _to_int(r.get("total_against")) or 0,
                "total_abstain": _to_int(r.get("total_abstain")) or 0,
                "synced_at": _NOW,
            }
        )

    def stmt_factory(batch):
        stmt = pg_insert(VoteHeader).values(batch)
        return stmt.on_conflict_do_update(
            index_elements=["vote_id"],
            set_={c: stmt.excluded[c] for c in batch[0] if c != "vote_id"},
        )

    return await _upsert_batched(session, stmt_factory, rows)


async def _sync_vote_decisions(session: AsyncSession) -> int:
    # 1.27M rows — historical data that never changes after recording.
    # ON CONFLICT DO NOTHING skips already-loaded rows cheaply on re-sync.
    df = await fetch_csv("vote_rslts_kmmbr_shadow", timeout=180.0)
    rows = []
    for _, r in df.iterrows():
        vote_id = _to_int(r.get("vote_id"))
        member_id = _to_int(r.get("kmmbr_id"))
        if vote_id is None or member_id is None:
            continue
        raw_result = _to_int(r.get("vote_result")) or 0
        rows.append(
            {
                "vote_id": vote_id,
                "member_id": member_id,
                "member_name": _safe(r.get("kmmbr_name")),
                "result": VOTE_RESULT_MAP.get(raw_result, "absent"),
                "knesset_num": _to_int(r.get("knesset_num")),
                "faction_id": _to_int(r.get("faction_id")),
                "faction_name": _safe(r.get("faction_name")),
                "synced_at": _NOW,
            }
        )

    if not rows:
        return 0

    def stmt_factory(batch):
        return pg_insert(VoteDecision).values(batch).on_conflict_do_nothing()

    return await _upsert_batched(session, stmt_factory, rows)


# ── Main entry point ──────────────────────────────────────────────────────────


async def run_sync() -> None:
    logger.info("Starting oknesset CSV sync...")
    start = datetime.now(timezone.utc)

    async with AsyncSessionLocal() as session:
        tasks = [
            ("members", _sync_members(session)),
            ("member_factions", _sync_member_factions(session)),
            ("factions", _sync_factions(session)),
            ("bills", _sync_bills(session)),
            ("bill_initiators", _sync_bill_initiators(session)),
            ("vote_headers", _sync_vote_headers(session)),
        ]

        for name, coro in tasks:
            try:
                count = await coro
                await session.commit()
                logger.info("  synced %s: %d rows", name, count)
            except Exception as exc:
                await session.rollback()
                logger.error("  sync FAILED for %s: %s", name, exc, exc_info=True)

        # vote_decisions is slow (1.27M rows) — run last, separate commit
        try:
            count = await _sync_vote_decisions(session)
            await session.commit()
            logger.info("  synced vote_decisions: %d rows", count)
        except Exception as exc:
            await session.rollback()
            logger.error("  sync FAILED for vote_decisions: %s", exc, exc_info=True)

    elapsed = (datetime.now(timezone.utc) - start).total_seconds()
    logger.info("CSV sync complete in %.1fs — invalidating Redis caches", elapsed)

    # Invalidate all computed response caches so next request hits the DB
    redis = get_redis_client()
    patterns = [
        "stats:*",
        "bills:list:*",
        "bills:v4:list:*",
        "bills:detail:*",
        "bills:votes:*",
        "votes:list:*",
        "votes:v4:list:*",
        "votes:detail:*",
        "votes:v4:detail:*",
        "members:list:*",
        "members:detail:*",
        "members:stats:*",
        "parties:list:*",
        "parties:detail:*",
        "parties:cohesion:*",
    ]
    await invalidate_many(patterns, redis)
    logger.info("Redis caches invalidated")
