"""
Bills service -- corrected for real kns_bill.csv schema (PascalCase, verified 2026-03-12).

Real kns_bill.csv columns (PascalCase):
  BillID, KnessetNum, Name, SubTypeID, SubTypeDesc, PrivateNumber, CommitteeID,
  StatusID, Number, PostponementReasonID, PostponementReasonDesc, PublicationDate,
  MagazineNumber, PageNumber, IsContinuationBill, SummaryLaw, PublicationSeriesID,
  PublicationSeriesDesc, PublicationSeriesFirstCall, LastUpdatedDate

Real kns_billinitiator.csv columns:
  BillInitiatorID, BillID, PersonID, IsInitiator, Ordinal, LastUpdatedDate
  NOTE: Uses PersonID (maps to mk_individual.PersonID), NOT mk_individual_id directly.
  To get MK name, join with mk_individual on PersonID.

Status descriptions are NOT in kns_bill -- only StatusID is present.
"""
from __future__ import annotations

import logging
import math
from datetime import datetime, timezone
from typing import Any

import pandas as pd
import redis.asyncio as aioredis

from app.services import cache_service as cache
from app.services.oknesset_client import (
    fetch_bills_data, fetch_all_mk_data, fetch_v4,
    fetch_v4_bills_page, fetch_v4_bill_detail,
)

logger = logging.getLogger(__name__)

# Knesset bill status IDs (from oknesset documentation)
STATUS_MAP: dict[int, str] = {
    1:  "הונח על שולחן הכנסת",
    2:  "בהכנה להצבעה",
    3:  "עלה לדיון מוקדם",
    4:  "עבר/ה בקריאה ראשונה",
    5:  "בוועדה",
    6:  "עבר/ה בקריאה שנייה ושלישית",
    7:  "נדחה/ה",
    8:  "נסוג/ה",
    9:  "פג תוקף",
    10: "פוצל",
    11: "אוחד",
    12: "שונה שם",
    13: "הפך לחוק",
}


# OData v4 uses status IDs 100-180; map to canonical CSV IDs (1-13) for frontend compat
V4_TO_CANONICAL_STATUS: dict[int, int] = {
    118: 13,  # התקבלה בקריאה שלישית → הפך לחוק
    141: 4,   # הונחה לקריאה ראשונה
    111: 4,   # לדיון קראת קריאה ראשונה
    106: 4,   # בוועדת הכנסת לקביעת ועדה
    109: 4,   # אושרה לקריאה ראשונה
    167: 4,   # אושרה לקריאה ראשונה
    101: 5,   # הכנה לקריאה ראשונה → בוועדה
    108: 5,
    113: 5,   # הכנה לקריאה שנייה-שלישית
    115: 5,   # הוחזרה לוועדה
    130: 5,   # הונחה לקריאה שנייה-שלישית
    131: 5,   # הונחה לקריאה שלישית
    142: 5,   # בוועדת הכנסת
    178: 5,   # אושרה לקריאה שנייה-שלישית
    179: 5,
    104: 3,   # הונחה לדיון מוקדם
    150: 3,
    181: 3,
    114: 2,   # לדיון קריאה שנייה-שלישית
    117: 2,
    110: 7,   # בקשה לדין רציפות נדחתה
    120: 7,
    140: 7,   # להסרה מסדר היום
    143: 7,
    176: 7,
    177: 7,   # נעצרה → נדחה
    122: 11,  # מוזגה → אוחד
    126: 11,
    169: 11,
    124: 12,  # הוסבה → שונה שם
}

# Reverse: canonical filter-bar IDs → OData v4 status IDs (OR logic in query)
CANONICAL_TO_V4_STATUS: dict[int, list[int]] = {
    2:  [101, 108, 114, 117],
    3:  [104, 150, 181],
    4:  [106, 109, 111, 141, 167],
    5:  [101, 108, 113, 115, 130, 131, 142, 178, 179],
    6:  [118],
    7:  [110, 120, 140, 143, 176, 177],
    8:  [177],
    9:  [140, 143, 177],
    11: [122, 126, 169],
    12: [124],
    13: [118],
}

_TTL_V4_BILLS_LIST   = 1800   # 30 min
_TTL_V4_BILLS_DETAIL = 3600   # 1 h  — a bill's status can change


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe(val: Any) -> Any:
    try:
        if pd.isna(val):
            return None
    except (TypeError, ValueError):
        pass
    return val


def _row_to_bill(row: pd.Series, initiators: list[dict]) -> dict:
    status_id = int(_safe(row.get("StatusID")) or 0)
    return {
        "bill_id":         int(_safe(row.get("BillID")) or 0),
        "knesset_num":     int(_safe(row.get("KnessetNum")) or 0),
        "name":            _safe(row.get("Name", "")),
        "name_eng":        None,
        "status_id":       status_id,
        "status_desc":     STATUS_MAP.get(status_id, f"סטטוס {status_id}"),
        "sub_type_id":     int(_safe(row["SubTypeID"])) if _safe(row.get("SubTypeID")) else None,
        "sub_type_desc":   _safe(row.get("SubTypeDesc")),
        "union_type_id":   None,
        "publication_date": str(_safe(row["PublicationDate"]))[:10] if _safe(row.get("PublicationDate")) else None,
        "publication_num": int(_safe(row["PrivateNumber"])) if _safe(row.get("PrivateNumber")) else None,
        "summary_law":     _safe(row.get("SummaryLaw")),
        "is_continuation": bool(_safe(row.get("IsContinuationBill", False))),
        "initiators":      initiators,
    }


def _build_init_map(init_df: pd.DataFrame, mk_df: pd.DataFrame) -> dict[int, list[dict]]:
    """
    Build BillID → [initiator] map.
    kns_billinitiator uses PersonID; join with mk_individual on PersonID to get names.
    """
    init_map: dict[int, list[dict]] = {}
    if init_df.empty:
        return init_map

    # Build PersonID → MK info lookup from mk_individual
    person_lookup: dict[int, dict] = {}
    if not mk_df.empty and "PersonID" in mk_df.columns:
        for _, mr in mk_df.iterrows():
            pid = _safe(mr.get("PersonID"))
            if pid:
                person_lookup[int(pid)] = {
                    "mk_individual_id": int(mr["mk_individual_id"]),
                    "mk_name":          _safe(mr.get("mk_individual_name", "")),
                    "mk_name_eng":      _safe(mr.get("mk_individual_name_eng", "")),
                    "faction_name":     None,
                }

    for _, ir in init_df.iterrows():
        if not bool(_safe(ir.get("IsInitiator", True))):
            continue
        bill_id = int(_safe(ir.get("BillID")) or 0)
        person_id = int(_safe(ir.get("PersonID")) or 0)
        mk_info = person_lookup.get(person_id, {
            "mk_individual_id": 0,
            "mk_name": f"PersonID:{person_id}",
            "mk_name_eng": "",
            "faction_name": None,
        })
        init_map.setdefault(bill_id, []).append(mk_info)

    return init_map


def _v4_row_to_bill(row: dict) -> dict:
    """Convert a KNS_Bill OData v4 row to the canonical bill dict shape.

    When ``$expand=KNS_BillInitiator($expand=KNS_Person)`` is used, the
    initiator names are extracted inline — no separate join needed.
    """
    raw_status_id = int(row.get("StatusID") or 0)
    canonical_status_id = V4_TO_CANONICAL_STATUS.get(raw_status_id, raw_status_id)
    status_desc = STATUS_MAP.get(canonical_status_id, f"סטטוס {raw_status_id}")
    pub_date = row.get("PublicationDate") or row.get("LastUpdatedDate")
    if pub_date:
        pub_date = str(pub_date)[:10]

    # Extract initiators from expanded navigation property
    initiators: list[dict] = []
    for init_row in (row.get("KNS_BillInitiator") or []):
        if not init_row.get("IsInitiator", True):
            continue
        person = init_row.get("KNS_Person") or {}
        last = (person.get("LastName") or "").strip()
        first = (person.get("FirstName") or "").strip()
        mk_name = f"{first} {last}".strip() if (first or last) else ""
        initiators.append({
            "mk_individual_id": int(person.get("Id") or 0),
            "mk_name":          mk_name or f"PersonID:{init_row.get('PersonID', '?')}",
            "mk_name_eng":      "",
            "faction_name":     None,
        })

    return {
        "bill_id":          int(row.get("BillID") or row.get("Id") or 0),
        "knesset_num":      int(row.get("KnessetNum") or 0),
        "name":             (row.get("Name") or "").strip(),
        "name_eng":         None,
        "status_id":        canonical_status_id,
        "status_desc":      status_desc,
        "sub_type_id":      int(row["SubTypeID"]) if row.get("SubTypeID") is not None else None,
        "sub_type_desc":    row.get("SubTypeDesc"),
        "union_type_id":    None,
        "publication_date": pub_date,
        "publication_num":  int(row["PrivateNumber"]) if row.get("PrivateNumber") is not None else None,
        "summary_law":      row.get("SummaryLaw"),
        "is_continuation":  bool(row.get("IsContinuationBill", False)),
        "initiators":       initiators,
    }


async def list_bills_v4(
    redis: aioredis.Redis,
    page: int = 1,
    limit: int = 20,
    search: str | None = None,
    status_id: int | None = None,
    knesset_num: int | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
) -> dict:
    """List bills from the Knesset OData v4 API (Knesset 25+, current data)."""
    cache_key = cache.make_list_key(
        "bills:v4:list",
        page=page, limit=limit, search=search, status_id=status_id,
        knesset_num=knesset_num, date_from=date_from, date_to=date_to,
    )

    async def factory() -> dict:
        # Translate canonical status_id (1-13) to OData v4 StatusID values (100-180)
        v4_status_ids: list[int] | None = None
        if status_id is not None:
            v4_status_ids = CANONICAL_TO_V4_STATUS.get(status_id, [status_id])
        envelope = await fetch_v4_bills_page(
            page=page,
            limit=limit,
            knesset_num=knesset_num if knesset_num is not None else 25,
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
            "pagination": {"page": page, "limit": limit, "total": total, "total_pages": total_pages},
            "cached_at": _now_iso(),
        }

    return await cache.get_or_set(cache_key, factory, _TTL_V4_BILLS_LIST, redis)


async def list_bills(redis: aioredis.Redis, page: int = 1, limit: int = 20,
                     search: str | None = None, status_id: int | None = None,
                     knesset_num: int | None = None,
                     date_from: str | None = None, date_to: str | None = None) -> dict:
    # Route to OData v4 for Knesset 25+ (or when no specific knesset is asked)
    if knesset_num is None or knesset_num >= 25:
        return await list_bills_v4(
            redis, page=page, limit=limit, search=search, status_id=status_id,
            knesset_num=knesset_num, date_from=date_from, date_to=date_to,
        )

    # ── Legacy CSV path (Knesset ≤ 24) ───────────────────────────────────────
    cache_key = cache.make_list_key("bills:list", page=page, limit=limit,
                                    search=search, status_id=status_id,
                                    knesset_num=knesset_num, date_from=date_from, date_to=date_to)

    async def factory() -> dict:
        frames = await fetch_bills_data()
        df = frames.get("kns_bill", pd.DataFrame())
        if df.empty:
            return {"data": [], "pagination": {"page": page, "limit": limit, "total": 0, "total_pages": 0}, "cached_at": _now_iso()}

        if search and "Name" in df.columns:
            df = df[df["Name"].str.contains(search, na=False, case=False)]
        if status_id is not None and "StatusID" in df.columns:
            df = df[df["StatusID"] == status_id]
        if knesset_num is not None and "KnessetNum" in df.columns:
            df = df[df["KnessetNum"] == knesset_num]
        if date_from and "PublicationDate" in df.columns:
            df = df[df["PublicationDate"] >= date_from]
        if date_to and "PublicationDate" in df.columns:
            df = df[df["PublicationDate"] <= date_to]

        if "PublicationDate" in df.columns:
            df = df.sort_values("PublicationDate", ascending=False, na_position="last")

        total = len(df)
        total_pages = math.ceil(total / limit) if total else 1
        page_df = df.iloc[(page - 1) * limit: page * limit]

        # Build initiator map for this page only (performance)
        init_df = frames.get("kns_billinitiator", pd.DataFrame())
        page_bill_ids = set(page_df["BillID"].dropna().astype(int).tolist())
        filtered_init = init_df[init_df["BillID"].isin(page_bill_ids)] if not init_df.empty else pd.DataFrame()

        # Fetch MK data for PersonID join
        mk_frames = await fetch_all_mk_data()
        mk_df = mk_frames.get("mk_individual", pd.DataFrame())

        init_map = _build_init_map(filtered_init, mk_df)
        bills = [_row_to_bill(row, init_map.get(int(_safe(row["BillID"]) or 0), [])) for _, row in page_df.iterrows()]
        return {
            "data": bills,
            "pagination": {"page": page, "limit": limit, "total": total, "total_pages": total_pages},
            "cached_at": _now_iso(),
        }

    return await cache.get_or_set(cache_key, factory, cache.TTL_BILLS_LIST, redis)


async def get_bill(bill_id: int, redis: aioredis.Redis) -> dict | None:
    """Fetch a single bill detail.  Tries OData v4 first (fast, with initiators),
    then falls back to CSV for historical bills not in v4."""
    cache_key = f"bills:detail:{bill_id}"

    async def factory() -> dict | None:
        # Try OData v4 first (covers K25+ and has $expand for initiators)
        v4_row = await fetch_v4_bill_detail(bill_id)
        if v4_row:
            return _v4_row_to_bill(v4_row)

        # Fallback to CSV (covers Knesset ≤ 24)
        frames = await fetch_bills_data()
        df = frames.get("kns_bill", pd.DataFrame())
        if not df.empty:
            rows = df[df["BillID"] == bill_id]
            if not rows.empty:
                init_df = frames.get("kns_billinitiator", pd.DataFrame())
                bill_inits = init_df[init_df["BillID"] == bill_id] if not init_df.empty else pd.DataFrame()
                mk_frames = await fetch_all_mk_data()
                mk_df = mk_frames.get("mk_individual", pd.DataFrame())
                init_map = _build_init_map(bill_inits, mk_df)
                return _row_to_bill(rows.iloc[0], init_map.get(bill_id, []))

        return None

    return await cache.get_or_set(cache_key, factory, cache.TTL_BILL_DETAIL, redis)
