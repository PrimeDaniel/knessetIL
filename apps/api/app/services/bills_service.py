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
from app.services.oknesset_client import fetch_bills_data, fetch_all_mk_data

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


async def list_bills(redis: aioredis.Redis, page: int = 1, limit: int = 20,
                     search: str | None = None, status_id: int | None = None,
                     knesset_num: int | None = None,
                     date_from: str | None = None, date_to: str | None = None) -> dict:
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
    cache_key = f"bills:detail:{bill_id}"

    async def factory() -> dict | None:
        frames = await fetch_bills_data()
        df = frames.get("kns_bill", pd.DataFrame())
        if df.empty:
            return None
        rows = df[df["BillID"] == bill_id]
        if rows.empty:
            return None

        init_df = frames.get("kns_billinitiator", pd.DataFrame())
        bill_inits = init_df[init_df["BillID"] == bill_id] if not init_df.empty else pd.DataFrame()
        mk_frames = await fetch_all_mk_data()
        mk_df = mk_frames.get("mk_individual", pd.DataFrame())
        init_map = _build_init_map(bill_inits, mk_df)

        return _row_to_bill(rows.iloc[0], init_map.get(bill_id, []))

    return await cache.get_or_set(cache_key, factory, cache.TTL_BILL_DETAIL, redis)
