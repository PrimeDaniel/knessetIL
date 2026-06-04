"""
One-time seed script: updates current Knesset 25 MK data from the official
Knesset MkLobby API (www.knesset.gov.il/WebSiteApi/knessetapi/MkLobby/GetMkLobbyData).

Updates per matched MK:
  - photo_url  → official high-res photo from fs.knesset.gov.il
  - phone      → official contact phone
  - is_coalition → coalition (True) or opposition (False)
  - is_current → True for matched MKs; False for DB is_current=True rows not in list
  - member_factions → faction_name for the open-ended K25 record

Run from apps/api/ with venv active:
  python scripts/seed_knesset25.py

Or with live fetch instead of cached JSON:
  python scripts/seed_knesset25.py --fetch
"""

import argparse
import asyncio
import json
import logging
import sys
from datetime import date, datetime, timezone
from pathlib import Path

import httpx
from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.database import AsyncSessionLocal
from app.db_models.member import Member, MemberFaction

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger(__name__)

MKLOBBY_URL = "https://www.knesset.gov.il/WebSiteApi/knessetapi/MkLobby/GetMkLobbyData?lang=he"
SEED_PATH = Path(__file__).parent.parent / "data" / "mklobby_k25.json"
KNESSET_NUM = 25


def _norm(s: str | None) -> str:
    """Strip whitespace and remove apostrophe variants for fuzzy matching."""
    return (s or "").strip().replace("'", "").replace("’", "")


async def _fetch_mklobby() -> list[dict]:
    log.info("Fetching MkLobby data from knesset.gov.il...")
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(MKLOBBY_URL)
        r.raise_for_status()
        raw = r.json()["mks"]
    return _normalize(raw)


def _normalize(raw: list[dict]) -> list[dict]:
    return [
        {
            "mk_id": m["MkId"],
            "first_name": (m.get("Firstname") or "").strip(),
            "last_name": (m.get("Lastname") or "").strip(),
            "faction_id": m.get("FactionId"),
            "faction_name": (m.get("FactionName") or "").strip(),
            "photo_url": m.get("ImagePath"),
            "email": m.get("Email") or None,
            "phone": m.get("Phone") or None,
            "gender_id": m.get("GenderId"),
            "is_coalition": m.get("IsCoalition", False),
            "is_present": m.get("IsPresent", False),
        }
        for m in raw
    ]


def _load_cached() -> list[dict]:
    if not SEED_PATH.exists():
        raise FileNotFoundError(f"Cached seed not found at {SEED_PATH}. Run with --fetch.")
    with open(SEED_PATH, encoding="utf-8") as f:
        return json.load(f)


def _save_cache(mks: list[dict]) -> None:
    SEED_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(SEED_PATH, "w", encoding="utf-8") as f:
        json.dump(mks, f, ensure_ascii=False, indent=2)
    log.info("Cached %d MKs to %s", len(mks), SEED_PATH)


def _build_name_index(members: list[Member]) -> dict:
    """
    Returns two indices:
      full_index: (norm_last, norm_first) → Member  — exact compound match
      last_index: norm_last → [Member, ...]          — fallback single-name match
    """
    full: dict[tuple[str, str], Member] = {}
    last: dict[str, list[Member]] = {}
    for m in members:
        nl = _norm(m.last_name)
        nf = _norm(m.first_name)
        if nl:
            full[(nl, nf)] = m
            last.setdefault(nl, []).append(m)
    return full, last


def _find_member(mk: dict, full_index, last_index) -> Member | None:
    nl = _norm(mk["last_name"])
    nf = _norm(mk["first_name"])

    # 1. Exact (last, first) match
    m = full_index.get((nl, nf))
    if m:
        return m

    # 2. First word of first name (handles "מאיר" matching "מאיר פרוש" etc.)
    nf_first_word = nf.split()[0] if nf else ""
    candidates = last_index.get(nl, [])
    for c in candidates:
        cf = _norm(c.first_name)
        if cf == nf or cf.startswith(nf_first_word) or nf.startswith(_norm(c.first_name).split()[0] if c.first_name else ""):
            return c

    # 3. Unique last name — only one candidate
    if len(candidates) == 1:
        return candidates[0]

    return None


async def seed(mks: list[dict]) -> None:
    now = datetime.now(timezone.utc)
    updated = 0
    not_found: list[str] = []
    mklobby_mk_ids: set[int] = set()

    async with AsyncSessionLocal() as session:
        # Load all DB members
        result = await session.execute(select(Member))
        all_members = result.scalars().all()
        full_index, last_index = _build_name_index(all_members)

        for mk in mks:
            member = _find_member(mk, full_index, last_index)
            if member is None:
                not_found.append(f"{mk['first_name']} {mk['last_name']}")
                continue

            mk_db_id = member.mk_individual_id
            mklobby_mk_ids.add(mk_db_id)

            # Update member row
            await session.execute(
                update(Member)
                .where(Member.mk_individual_id == mk_db_id)
                .values(
                    photo_url=mk["photo_url"],
                    phone=mk["phone"],
                    email=mk["email"] or member.email,
                    is_coalition=mk["is_coalition"],
                    is_current=True,
                    synced_at=now,
                )
            )

            # Fix current faction name for K25 open-ended record
            if mk.get("faction_name"):
                fac_result = await session.execute(
                    select(MemberFaction).where(
                        MemberFaction.mk_individual_id == mk_db_id,
                        MemberFaction.knesset_num == KNESSET_NUM,
                        MemberFaction.finish_date.is_(None),
                    )
                )
                open_factions = fac_result.scalars().all()

                if open_factions:
                    for fac in open_factions:
                        await session.execute(
                            update(MemberFaction)
                            .where(MemberFaction.id == fac.id)
                            .values(faction_name=mk["faction_name"], synced_at=now)
                        )
                else:
                    stmt = pg_insert(MemberFaction).values(
                        mk_individual_id=mk_db_id,
                        faction_id=mk.get("faction_id", 0),
                        faction_name=mk["faction_name"],
                        start_date=date(2022, 11, 1),
                        finish_date=None,
                        knesset_num=KNESSET_NUM,
                        synced_at=now,
                    )
                    await session.execute(
                        stmt.on_conflict_do_update(
                            constraint="uq_member_faction_start",
                            set_={"faction_name": mk["faction_name"], "synced_at": now},
                        )
                    )

            updated += 1

        # Mark DB is_current=True rows that aren't in MkLobby as no longer current
        stale_ids = [m.mk_individual_id for m in all_members if m.is_current and m.mk_individual_id not in mklobby_mk_ids]
        if stale_ids:
            await session.execute(
                update(Member)
                .where(Member.mk_individual_id.in_(stale_ids))
                .values(is_current=False, synced_at=now)
            )
            log.info("Marked %d stale is_current=True rows as is_current=False", len(stale_ids))

        await session.commit()

    log.info("Updated %d MKs", updated)
    if not_found:
        log.warning("Could not match %d MKs by name: %s", len(not_found), not_found)


async def main(fetch: bool) -> None:
    if fetch:
        mks = await _fetch_mklobby()
        _save_cache(mks)
    else:
        mks = _load_cached()

    log.info("Seeding %d MKs...", len(mks))
    await seed(mks)
    log.info("Done.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--fetch", action="store_true", help="Fetch fresh data from knesset.gov.il")
    args = parser.parse_args()
    asyncio.run(main(args.fetch))
