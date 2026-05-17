"""
Bills service.

Routing:
  knesset_num is None or >= 25  →  OData v4 (live Knesset data)
  knesset_num <= 24             →  PostgreSQL bills table (synced from CSV)

kns_bill.csv columns stored in DB (originally PascalCase):
  bill_id, knesset_num, name, sub_type_id, sub_type_desc, status_id,
  private_number, publication_date, is_continuation, summary_law

Initiators join: bill_initiators.person_id → members.person_id (NOT mk_individual_id).
"""

from __future__ import annotations

import logging
import math
from datetime import datetime, timezone

import redis.asyncio as aioredis
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db_models.bill import Bill, BillInitiator
from app.db_models.member import Member
from app.services import cache_service as cache
from app.services.oknesset_client import (
    fetch_v4_bills_page,
    fetch_v4_bill_detail,
)

logger = logging.getLogger(__name__)

# Canonical bill status labels (status_id 1–13 from CSV)
STATUS_MAP: dict[int, str] = {
    1: "הונח על שולחן הכנסת",
    2: "בהכנה להצבעה",
    3: "עלה לדיון מוקדם",
    4: "עבר/ה בקריאה ראשונה",
    5: "בוועדה",
    6: "עבר/ה בקריאה שנייה ושלישית",
    7: "נדחה/ה",
    8: "נסוג/ה",
    9: "פג תוקף",
    10: "פוצל",
    11: "אוחד",
    12: "שונה שם",
    13: "הפך לחוק",
}

# OData v4 status IDs → canonical 1-13
V4_TO_CANONICAL_STATUS: dict[int, int] = {
    118: 13,
    141: 4,
    111: 4,
    106: 4,
    109: 4,
    167: 4,
    101: 5,
    108: 5,
    113: 5,
    115: 5,
    130: 5,
    131: 5,
    142: 5,
    178: 5,
    179: 5,
    104: 3,
    150: 3,
    181: 3,
    114: 2,
    117: 2,
    110: 7,
    120: 7,
    140: 7,
    143: 7,
    176: 7,
    177: 7,
    122: 11,
    126: 11,
    169: 11,
    124: 12,
}

# Canonical → OData v4 status IDs (for filtering)
CANONICAL_TO_V4_STATUS: dict[int, list[int]] = {
    2: [101, 108, 114, 117],
    3: [104, 150, 181],
    4: [106, 109, 111, 141, 167],
    5: [101, 108, 113, 115, 130, 131, 142, 178, 179],
    6: [118],
    7: [110, 120, 140, 143, 176, 177],
    11: [122, 126, 169],
    12: [124],
    13: [118],
}

_TTL_V4_BILLS_LIST = 1_800  # 30 min
_TTL_V4_BILLS_DETAIL = 3_600  # 1 h


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _bill_to_dict(bill: Bill, initiators: list[dict]) -> dict:
    status_id = bill.status_id or 0
    return {
        "bill_id": bill.bill_id,
        "knesset_num": bill.knesset_num,
        "name": bill.name or "",
        "name_eng": None,
        "status_id": status_id,
        "status_desc": STATUS_MAP.get(status_id, f"סטטוס {status_id}"),
        "sub_type_id": bill.sub_type_id,
        "sub_type_desc": bill.sub_type_desc,
        "union_type_id": None,
        "publication_date": bill.publication_date.isoformat() if bill.publication_date else None,
        "publication_num": bill.private_number,
        "summary_law": bill.summary_law,
        "is_continuation": bill.is_continuation,
        "initiators": initiators,
    }


def _v4_row_to_bill(row: dict) -> dict:
    """Convert a KNS_Bill OData v4 row to the canonical bill dict."""
    raw_status_id = int(row.get("StatusID") or 0)
    canonical_status_id = V4_TO_CANONICAL_STATUS.get(raw_status_id, raw_status_id)
    status_desc = STATUS_MAP.get(canonical_status_id, f"סטטוס {raw_status_id}")
    pub_date = row.get("PublicationDate") or row.get("LastUpdatedDate")
    if pub_date:
        pub_date = str(pub_date)[:10]

    initiators: list[dict] = []
    for init_row in row.get("KNS_BillInitiator") or []:
        if not init_row.get("IsInitiator", True):
            continue
        person = init_row.get("KNS_Person") or {}
        last = (person.get("LastName") or "").strip()
        first = (person.get("FirstName") or "").strip()
        mk_name = f"{first} {last}".strip() or f"PersonID:{init_row.get('PersonID', '?')}"
        initiators.append(
            {
                "mk_individual_id": int(person.get("Id") or 0),
                "mk_name": mk_name,
                "mk_name_eng": "",
                "faction_name": None,
            }
        )

    return {
        "bill_id": int(row.get("BillID") or row.get("Id") or 0),
        "knesset_num": int(row.get("KnessetNum") or 0),
        "name": (row.get("Name") or "").strip(),
        "name_eng": None,
        "status_id": canonical_status_id,
        "status_desc": status_desc,
        "sub_type_id": int(row["SubTypeID"]) if row.get("SubTypeID") is not None else None,
        "sub_type_desc": row.get("SubTypeDesc"),
        "union_type_id": None,
        "publication_date": pub_date,
        "publication_num": int(row["PrivateNumber"])
        if row.get("PrivateNumber") is not None
        else None,
        "summary_law": row.get("SummaryLaw"),
        "is_continuation": bool(row.get("IsContinuationBill", False)),
        "initiators": initiators,
    }


async def _load_initiators(bill_ids: list[int], db: AsyncSession) -> dict[int, list[dict]]:
    """Load initiators for a set of bill IDs, joined to members for names."""
    if not bill_ids:
        return {}

    result = await db.execute(
        select(BillInitiator, Member)
        .outerjoin(Member, Member.person_id == BillInitiator.person_id)
        .where(
            BillInitiator.bill_id.in_(bill_ids),
            BillInitiator.is_initiator == True,  # noqa: E712
        )
        .order_by(BillInitiator.bill_id, BillInitiator.ordinal)
    )
    init_map: dict[int, list[dict]] = {}
    for init_row, member in result.all():
        entry = {
            "mk_individual_id": member.mk_individual_id if member else 0,
            "mk_name": member.full_name if member else f"PersonID:{init_row.person_id}",
            "mk_name_eng": member.full_name_eng if member else "",
            "faction_name": None,
        }
        init_map.setdefault(init_row.bill_id, []).append(entry)
    return init_map


# ── OData v4 path (Knesset 25+) ───────────────────────────────────────────────


async def list_bills_v4(
    redis: aioredis.Redis,
    page: int = 1,
    limit: int = 20,
    search: str | None = None,
    status_id: int | None = None,
    knesset_num: int | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    current_knesset: int = 25,
) -> dict:
    cache_key = cache.make_list_key(
        "bills:v4:list",
        page=page,
        limit=limit,
        search=search,
        status_id=status_id,
        knesset_num=knesset_num,
        date_from=date_from,
        date_to=date_to,
    )

    async def factory() -> dict:
        v4_status_ids: list[int] | None = None
        if status_id is not None:
            v4_status_ids = CANONICAL_TO_V4_STATUS.get(status_id, [status_id])
        envelope = await fetch_v4_bills_page(
            page=page,
            limit=limit,
            knesset_num=knesset_num if knesset_num is not None else current_knesset,
            status_ids=v4_status_ids,
            search=search,
            date_from=date_from,
            date_to=date_to,
        )
        bill_rows = envelope.get("value", [])
        total = int(envelope.get("@odata.count") or 0)
        bills = [_v4_row_to_bill(r) for r in bill_rows]
        total_pages = math.ceil(total / limit) if total else 1
        return {
            "data": bills,
            "pagination": {
                "page": page,
                "limit": limit,
                "total": total,
                "total_pages": total_pages,
            },
            "cached_at": _now_iso(),
        }

    return await cache.get_or_set(cache_key, factory, _TTL_V4_BILLS_LIST, redis)


# ── PostgreSQL path (Knesset ≤ 24) ───────────────────────────────────────────


async def list_bills_db(
    db: AsyncSession,
    redis: aioredis.Redis,
    page: int = 1,
    limit: int = 20,
    search: str | None = None,
    status_id: int | None = None,
    knesset_num: int | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
) -> dict:
    cache_key = cache.make_list_key(
        "bills:list",
        page=page,
        limit=limit,
        search=search,
        status_id=status_id,
        knesset_num=knesset_num,
        date_from=date_from,
        date_to=date_to,
    )

    async def factory() -> dict:
        stmt = select(Bill)

        if knesset_num is not None:
            stmt = stmt.where(Bill.knesset_num == knesset_num)
        if status_id is not None:
            stmt = stmt.where(Bill.status_id == status_id)
        if search:
            stmt = stmt.where(Bill.name.ilike(f"%{search}%"))
        if date_from:
            stmt = stmt.where(Bill.publication_date >= date_from)
        if date_to:
            stmt = stmt.where(Bill.publication_date <= date_to)

        count_result = await db.execute(select(func.count()).select_from(stmt.subquery()))
        total = count_result.scalar_one()

        stmt = stmt.order_by(Bill.publication_date.desc().nulls_last())
        stmt = stmt.offset((page - 1) * limit).limit(limit)
        result = await db.execute(stmt)
        bills = result.scalars().all()

        bill_ids = [b.bill_id for b in bills]
        init_map = await _load_initiators(bill_ids, db)

        data = [_bill_to_dict(b, init_map.get(b.bill_id, [])) for b in bills]
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

    return await cache.get_or_set(cache_key, factory, cache.TTL_BILLS_LIST, redis)


# ── Unified entry points ───────────────────────────────────────────────────────


async def list_bills(
    db: AsyncSession,
    redis: aioredis.Redis,
    page: int = 1,
    limit: int = 20,
    search: str | None = None,
    status_id: int | None = None,
    knesset_num: int | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    current_knesset: int = 25,
) -> dict:
    if knesset_num is None or knesset_num >= current_knesset:
        return await list_bills_v4(
            redis,
            page=page,
            limit=limit,
            search=search,
            status_id=status_id,
            knesset_num=knesset_num,
            date_from=date_from,
            date_to=date_to,
            current_knesset=current_knesset,
        )
    return await list_bills_db(
        db,
        redis,
        page=page,
        limit=limit,
        search=search,
        status_id=status_id,
        knesset_num=knesset_num,
        date_from=date_from,
        date_to=date_to,
    )


async def get_bill(bill_id: int, db: AsyncSession, redis: aioredis.Redis) -> dict | None:
    cache_key = f"bills:detail:{bill_id}"

    async def factory() -> dict | None:
        # Try OData v4 first (covers K25+ with expanded initiators)
        v4_row = await fetch_v4_bill_detail(bill_id)
        if v4_row:
            return _v4_row_to_bill(v4_row)

        # Fallback: PostgreSQL for historical bills (K≤24)
        result = await db.execute(select(Bill).where(Bill.bill_id == bill_id))
        bill = result.scalar_one_or_none()
        if bill is None:
            return None

        init_map = await _load_initiators([bill_id], db)
        return _bill_to_dict(bill, init_map.get(bill_id, []))

    return await cache.get_or_set(cache_key, factory, cache.TTL_BILL_DETAIL, redis)


async def count_bills(db: AsyncSession, knesset_num: int | None = None) -> int:
    stmt = select(func.count()).select_from(Bill)
    if knesset_num is not None:
        stmt = stmt.where(Bill.knesset_num == knesset_num)
    result = await db.execute(stmt)
    return result.scalar_one() or 0
