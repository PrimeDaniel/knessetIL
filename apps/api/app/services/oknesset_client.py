"""
Open Knesset CSV client — corrected with real URL structure and schemas.

Data source: https://production.oknesset.org/pipelines/data/
Schema verified from datapackage.json files on 2026-03-12.

Directory structure (NOT flat — grouped by topic):
  members/mk_individual/   → mk_individual.csv, mk_individual_factions.csv, factions.csv
  bills/kns_bill/          → kns_bill.csv  (14 MB, 60,088 rows, PascalCase columns)
  bills/kns_billinitiator/ → kns_billinitiator.csv (PersonID, not mk_individual_id)
  votes/view_vote_rslts_hdr_approved/ → aggregate vote results (no per-MK decisions)
  votes/view_vote_mk_individual/      → MK lookup table only (vip_id → mk info)

IMPORTANT DATA LIMITATION:
  Per-MK vote decisions (For/Against/Abstain per individual MK per vote) are NOT
  available in the public CSV data. Only aggregate totals (total_for, total_against,
  total_abstain) are provided in view_vote_rslts_hdr_approved. Rebellion rate
  computation therefore uses estimated/unavailable data and is disabled in Phase 1.
"""
import io
import logging
from typing import Any

import httpx
import pandas as pd

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# ── Verified CSV URLs (from datapackage.json inspection, 2026-03-12) ──────────
# Base: https://production.oknesset.org/pipelines/data/
DATASET_URLS: dict[str, str] = {
    # Members — 1,166 rows
    "mk_individual":
        "members/mk_individual/mk_individual.csv",
    # Faction history — 4,503 rows
    "mk_individual_factions":
        "members/mk_individual/mk_individual_factions.csv",
    # Party master list
    "factions":
        "members/mk_individual/factions.csv",
    # Bills — 60,088 rows, 14 MB, PascalCase columns
    "kns_bill":
        "bills/kns_bill/kns_bill.csv",
    # Bill initiators — 169,562 rows (uses PersonID, not mk_individual_id)
    "kns_billinitiator":
        "bills/kns_billinitiator/kns_billinitiator.csv",
    # Vote results — 24,744 rows, aggregate totals only
    "view_vote_rslts_hdr_approved":
        "votes/view_vote_rslts_hdr_approved/view_vote_rslts_hdr_approved.csv",
    # MK vote lookup — 1,111 rows (vip_id → mk_individual_id mapping ONLY)
    "view_vote_mk_individual":
        "votes/view_vote_mk_individual/view_vote_mk_individual.csv",
}


def _csv_url(dataset: str) -> str:
    path = DATASET_URLS[dataset]
    return f"{settings.oknesset_base_url}/{path}"


async def fetch_csv(dataset: str, timeout: float = 90.0) -> pd.DataFrame:
    """
    Fetch a CSV dataset from oknesset and return it as a pandas DataFrame.
    Large files (kns_bill at 14 MB) use streaming to avoid memory spikes.
    """
    url = _csv_url(dataset)
    logger.info("Fetching CSV: %s", url)

    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        response = await client.get(url)
        response.raise_for_status()

    df = pd.read_csv(
        io.StringIO(response.text),
        low_memory=False,
        encoding="utf-8",
    )
    logger.info("Fetched %s: %d rows, %d cols", dataset, len(df), len(df.columns))
    return df


async def fetch_all_mk_data() -> dict[str, pd.DataFrame]:
    """
    Fetch MK profile + faction history CSVs.
    Note: mk_individual.csv already contains the photo URL in the
    'mk_individual_photo' column — no separate photo file needed.
    mk_individual_positions.csv is currently empty (0 bytes), skipped.
    """
    import asyncio

    datasets = ["mk_individual", "mk_individual_factions"]
    results = await asyncio.gather(
        *[fetch_csv(ds) for ds in datasets],
        return_exceptions=True,
    )
    out: dict[str, pd.DataFrame] = {}
    for ds, result in zip(datasets, results):
        if isinstance(result, Exception):
            logger.error("Failed to fetch %s: %s", ds, result)
        else:
            out[ds] = result
    return out


async def fetch_vote_data() -> dict[str, pd.DataFrame]:
    """
    Fetch vote data.
    view_vote_rslts_hdr_approved: 24,744 vote events with aggregate totals.
    view_vote_mk_individual: lookup table (vip_id → MK info), NOT vote decisions.
    """
    import asyncio

    datasets = ["view_vote_rslts_hdr_approved", "view_vote_mk_individual"]
    results = await asyncio.gather(
        *[fetch_csv(ds) for ds in datasets],
        return_exceptions=True,
    )
    out: dict[str, pd.DataFrame] = {}
    for ds, result in zip(datasets, results):
        if isinstance(result, Exception):
            logger.error("Failed to fetch %s: %s", ds, result)
        else:
            out[ds] = result
    return out


async def fetch_bills_data() -> dict[str, pd.DataFrame]:
    """
    Fetch bills + initiators.
    kns_bill: 60,088 rows, PascalCase columns (BillID, KnessetNum, Name, StatusID...).
    kns_billinitiator: uses PersonID (maps to mk_individual.PersonID, not mk_individual_id).
    """
    import asyncio

    datasets = ["kns_bill", "kns_billinitiator"]
    results = await asyncio.gather(
        *[fetch_csv(ds) for ds in datasets],
        return_exceptions=True,
    )
    out: dict[str, pd.DataFrame] = {}
    for ds, result in zip(datasets, results):
        if isinstance(result, Exception):
            logger.error("Failed to fetch %s: %s", ds, result)
        else:
            out[ds] = result
    return out
