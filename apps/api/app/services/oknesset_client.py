"""
Open Knesset CSV client.

The oknesset data source is NOT a REST API — it's a collection of flat CSV
files at https://production.oknesset.org/pipelines/data/<dataset>/datapackage.json
Each dataset has a "resources" key listing the actual CSV download URLs.

Key datasets used:
  - mk_individual          → MK profiles (1,166 records)
  - mk_individual_factions → faction membership history
  - factions               → party/faction master data
  - laws                   → bills (60,088 records)
  - law_initiators         → bill → MK links
  - view_vote_rslts_hdr_approved → vote header (24,744 rows, 5.7 MB)
  - view_vote_mk_individual      → per-MK vote decisions
"""
import io
import logging
from typing import Any

import httpx
import pandas as pd

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Dataset slug → resource file name (first resource in datapackage)
DATASETS: dict[str, str] = {
    "mk_individual": "mk_individual.csv",
    "mk_individual_factions": "mk_individual_factions.csv",
    "mk_individual_positions": "mk_individual_positions.csv",
    "mk_individual_phones": "mk_individual_phones.csv",
    "mk_individual_photo": "mk_individual_photo.csv",
    "factions": "factions.csv",
    "laws": "laws.csv",
    "law_names": "law_names.csv",
    "law_initiators": "law_initiators.csv",
    "view_vote_rslts_hdr_approved": "view_vote_rslts_hdr_approved.csv",
    "view_vote_mk_individual": "view_vote_mk_individual.csv",
}

# Constructed CSV URLs
def _csv_url(dataset: str) -> str:
    filename = DATASETS[dataset]
    return f"{settings.oknesset_base_url}/{dataset}/{filename}"


async def fetch_csv(dataset: str, timeout: float = 60.0) -> pd.DataFrame:
    """
    Fetch a CSV dataset from oknesset and return it as a pandas DataFrame.
    Raises httpx.HTTPError on network failure.
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
    """Fetch all MK-related CSVs needed to build complete MK profiles."""
    import asyncio

    datasets = [
        "mk_individual",
        "mk_individual_factions",
        "mk_individual_positions",
        "mk_individual_photo",
    ]
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
    """Fetch vote header + per-MK vote decision CSVs."""
    import asyncio

    datasets = ["view_vote_rslts_hdr_approved", "view_vote_mk_individual"]
    results = await asyncio.gather(*[fetch_csv(ds) for ds in datasets])
    return dict(zip(datasets, results))


async def fetch_bills_data() -> dict[str, pd.DataFrame]:
    """Fetch laws + names + initiators CSVs."""
    import asyncio

    datasets = ["laws", "law_initiators"]
    results = await asyncio.gather(*[fetch_csv(ds) for ds in datasets])
    return dict(zip(datasets, results))
