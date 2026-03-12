"""
Bills service: queries laws.csv (60,088 records) + law_initiators.csv.
Provides paginated list with search and filtering, plus bill detail.
"""
from __future__ import annotations

import logging
import math
from datetime import datetime, timezone
from typing import Any

import pandas as pd
import redis.asyncio as aioredis

from app.services import cache_service as cache
from app.services.oknesset_client import fetch_bills_data

logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe(val: Any) -> Any:
    if pd.isna(val):
        return None
    return val


def _row_to_bill(row: pd.Series, initiators: list[dict]) -> dict:
    return {
        "bill_id": int(_safe(row.get("law_id")) or _safe(row.get("bill_id")) or 0),
        "knesset_num": int(_safe(row.get("knesset_num")) or 0),
        "name": _safe(row.get("law_name") or row.get("name", "")),
        "name_eng": _safe(row.get("law_name_eng") or row.get("name_eng")),
        "status_id": int(_safe(row.get("law_status_id") or row.get("status_id")) or 0),
        "status_desc": _safe(row.get("law_status_desc") or row.get("status_desc", "")),
        "sub_type_id": int(_safe(row.get("sub_type_id"))) if _safe(row.get("sub_type_id")) else None,
        "sub_type_desc": _safe(row.get("sub_type_desc")),
        "union_type_id": int(_safe(row.get("union_type_id"))) if _safe(row.get("union_type_id")) else None,
        "publication_date": str(_safe(row.get("publication_date"))) if _safe(row.get("publication_date")) else None,
        "publication_num": int(_safe(row.get("publication_num"))) if _safe(row.get("publication_num")) else None,
        "summary_law": _safe(row.get("summary_law")),
        "is_continuation": bool(_safe(row.get("is_continuation", False))),
        "initiators": initiators,
    }


async def list_bills(
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
        "bills:list", page=page, limit=limit,
        search=search, status_id=status_id,
        knesset_num=knesset_num, date_from=date_from, date_to=date_to,
    )

    async def factory() -> dict:
        frames = await fetch_bills_data()
        df = frames.get("laws", pd.DataFrame())
        if df.empty:
            return {"data": [], "pagination": {"page": page, "limit": limit, "total": 0, "total_pages": 0}, "cached_at": _now_iso()}

        # Determine name column
        name_col = "law_name" if "law_name" in df.columns else "name"

        if search and name_col in df.columns:
            df = df[df[name_col].str.contains(search, na=False, case=False)]

        status_col = "law_status_id" if "law_status_id" in df.columns else "status_id"
        if status_id is not None and status_col in df.columns:
            df = df[df[status_col] == status_id]

        if knesset_num is not None and "knesset_num" in df.columns:
            df = df[df["knesset_num"] == knesset_num]

        pub_col = "publication_date"
        if date_from and pub_col in df.columns:
            df = df[df[pub_col] >= date_from]
        if date_to and pub_col in df.columns:
            df = df[df[pub_col] <= date_to]

        # Sort by publication_date desc (most recent first)
        if pub_col in df.columns:
            df = df.sort_values(pub_col, ascending=False, na_position="last")

        total = len(df)
        total_pages = math.ceil(total / limit) if total else 1
        offset = (page - 1) * limit
        page_df = df.iloc[offset: offset + limit]

        # Build initiators map (bill_id → list of initiators)
        init_df = frames.get("law_initiators", pd.DataFrame())
        init_map: dict[int, list[dict]] = {}
        if not init_df.empty:
            id_col = "law_id" if "law_id" in init_df.columns else "bill_id"
            for _, ir in init_df.iterrows():
                bid = int(_safe(ir.get(id_col)) or 0)
                init_map.setdefault(bid, []).append({
                    "mk_individual_id": int(_safe(ir.get("mk_individual_id")) or 0),
                    "mk_name": _safe(ir.get("mk_individual_name", "")),
                    "mk_name_eng": _safe(ir.get("mk_individual_name_eng", "")),
                    "faction_name": _safe(ir.get("faction_name")),
                })

        id_col = "law_id" if "law_id" in page_df.columns else "bill_id"
        bills = [
            _row_to_bill(row, init_map.get(int(_safe(row.get(id_col)) or 0), []))
            for _, row in page_df.iterrows()
        ]

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
        df = frames.get("laws", pd.DataFrame())
        if df.empty:
            return None

        id_col = "law_id" if "law_id" in df.columns else "bill_id"
        rows = df[df[id_col] == bill_id]
        if rows.empty:
            return None

        init_df = frames.get("law_initiators", pd.DataFrame())
        init_list: list[dict] = []
        if not init_df.empty:
            ic = "law_id" if "law_id" in init_df.columns else "bill_id"
            mk_rows = init_df[init_df[ic] == bill_id]
            for _, ir in mk_rows.iterrows():
                init_list.append({
                    "mk_individual_id": int(_safe(ir.get("mk_individual_id")) or 0),
                    "mk_name": _safe(ir.get("mk_individual_name", "")),
                    "mk_name_eng": _safe(ir.get("mk_individual_name_eng", "")),
                    "faction_name": _safe(ir.get("faction_name")),
                })

        return _row_to_bill(rows.iloc[0], init_list)

    return await cache.get_or_set(cache_key, factory, cache.TTL_BILL_DETAIL, redis)
