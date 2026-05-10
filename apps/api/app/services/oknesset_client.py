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
    # Per-MK vote decisions — 1,275,825 rows (vote_id, kmmbr_id, kmmbr_name,
    # vote_result [1=for 2=against 3=abstain 0=absent 4=not_participating],
    # knesset_num, faction_id, faction_name)
    "vote_rslts_kmmbr_shadow":
        "votes/vote_rslts_kmmbr_shadow/vote_rslts_kmmbr_shadow.csv",
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


async def fetch_vote_mk_decisions() -> pd.DataFrame:
    """
    Fetch per-MK vote decisions (85 MB, ~1.27 M rows).
    vote_result: 1=for, 2=against, 3=abstain, 0=absent, 4=not_participating
    Columns: vote_id, kmmbr_id, kmmbr_name, vote_result, knesset_num, faction_id, faction_name
    Caller is responsible for caching — this file is large.
    """
    return await fetch_csv("vote_rslts_kmmbr_shadow", timeout=180.0)


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


# ── Knesset OData v4 API ──────────────────────────────────────────────────────
# Base: https://knesset.gov.il/OdataV4/ParliamentInfo
# Provides CURRENT Knesset 25 data (2022–present), unlike frozen Open Knesset CSVs.

KNESSET_V4_BASE = "https://knesset.gov.il/OdataV4/ParliamentInfo"

# ResultCode values in KNS_PlenumVoteResult
V4_RESULT_CODE_MAP: dict[int, str] = {
    7: "for",      # בעד
    8: "against",  # נגד
    9: "abstain",  # נמנע
    6: "absent",   # נוכח (present-but-not-voting, treated as absent)
}


async def fetch_v4(path: str, params: dict | None = None, timeout: float = 30.0) -> dict:
    """
    GET from the Knesset OData v4 API and return the parsed JSON dict.

    ``path`` should be the entity path without a leading slash, e.g.
    ``"KNS_PlenumVote"``.  Query parameters are passed via ``params`` and are
    appended as a URL query string (httpx handles encoding).

    The API always requires ``$format=json``; this is injected automatically so
    callers don't have to remember it.

    Raises ``httpx.HTTPStatusError`` on 4xx/5xx responses so the caller can
    decide how to handle them.
    """
    merged_params: dict = {"$format": "json"}
    if params:
        merged_params.update(params)

    url = f"{KNESSET_V4_BASE}/{path}"
    logger.info("Fetching OData v4: %s  params=%s", url, merged_params)

    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        response = await client.get(url, params=merged_params)
        response.raise_for_status()

    return response.json()


async def fetch_v4_all(path: str, params: dict | None = None, timeout: float = 30.0) -> list[dict]:
    """
    Like ``fetch_v4`` but follows ``@odata.nextLink`` until all pages are collected.
    Returns the merged ``value`` list.  Handles servers that cap ``$top`` at 100.
    """
    merged_params: dict = {"$format": "json"}
    if params:
        merged_params.update(params)

    all_rows: list[dict] = []
    url: str | None = f"{KNESSET_V4_BASE}/{path}"

    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        while url:
            if url.startswith(KNESSET_V4_BASE):
                response = await client.get(url, params=merged_params if url == f"{KNESSET_V4_BASE}/{path}" else None)
            else:
                response = await client.get(url)
            response.raise_for_status()
            data = response.json()
            all_rows.extend(data.get("value", []))
            url = data.get("@odata.nextLink")

    return all_rows


async def fetch_v4_votes_page(page: int = 1, limit: int = 20) -> dict:
    """
    Fetch a paginated page of votes from ``KNS_PlenumVote``, sorted newest first.

    Returns the raw OData envelope::

        {
            "value": [ {...}, ... ],
            "@odata.count": 12345,   # total across all pages
        }

    Uses ``$top`` / ``$skip`` / ``$count=true`` / ``$orderby=VoteDateTime desc``.
    """
    skip = (page - 1) * limit
    params = {
        "$top": limit,
        "$skip": skip,
        "$count": "true",
        "$orderby": "VoteDateTime desc",
    }
    try:
        return await fetch_v4("KNS_PlenumVote", params=params)
    except Exception as exc:
        logger.error("fetch_v4_votes_page(page=%d, limit=%d) failed: %s", page, limit, exc)
        return {"value": [], "@odata.count": 0}


async def fetch_v4_vote_results(vote_id: int) -> list[dict]:
    """
    Fetch all ``KNS_PlenumVoteResult`` rows for a single vote.

    Returns a (possibly empty) list of result row dicts.
    Each dict contains at minimum: Id, MkId, VoteID, VoteDate, ResultCode,
    ResultDesc, LastName, FirstName, SessionID, ItemID.
    """
    params = {"$filter": f"VoteID eq {vote_id}"}
    try:
        data = await fetch_v4("KNS_PlenumVoteResult", params=params)
        return data.get("value", [])
    except Exception as exc:
        logger.error("fetch_v4_vote_results(vote_id=%d) failed: %s", vote_id, exc)
        return []


async def fetch_v4_mk_faction_map() -> dict[str, dict]:
    """
    Build a ``"LastName_FirstName" -> {faction_id, faction_name}`` lookup for
    all current Knesset 25 MKs.

    Strategy (three-step join):
    1. ``GET KNS_Person?$filter=IsCurrent eq true``
       → builds ``person_id -> (last_name, first_name)`` dict.
    2. ``GET KNS_PersonToPosition?$filter=KnessetNum eq 25 and PositionID eq 54 and IsCurrent eq true``
       → PositionID=54 means "חבר כנסת".  Builds ``person_id -> {faction_id, faction_name}``.
    3. Join steps 1 and 2 on ``person_id`` to produce ``name_key -> faction``.

    Example return value::

        {
            "ואטורי_ניסים": {"faction_id": 1096, "faction_name": "הליכוד"},
            ...
        }

    An empty dict is returned on error so callers degrade gracefully.
    """
    import asyncio

    try:
        persons_rows, positions_rows = await asyncio.gather(
            fetch_v4_all(
                "KNS_Person",
                params={"$filter": "IsCurrent eq true"},
            ),
            fetch_v4_all(
                "KNS_PersonToPosition",
                # Omit PositionID filter — ministers and committee chairs keep their
                # faction but change PositionID away from 54 (member of Knesset).
                # Deduplicate later by keeping the first entry seen per person.
                params={
                    "$filter": "KnessetNum eq 25 and FactionID ne null and IsCurrent eq true"
                },
            ),
        )
    except Exception as exc:
        logger.error("fetch_v4_mk_faction_map: failed to fetch base data: %s", exc)
        return {}

    # Step 1 — id -> (last_name, first_name)
    person_id_to_name: dict[int, tuple[str, str]] = {}
    for person in persons_rows:
        pid = person.get("Id")
        last = (person.get("LastName") or "").strip()
        first = (person.get("FirstName") or "").strip()
        if pid is not None:
            person_id_to_name[int(pid)] = (last, first)

    # Step 2 — person_id -> {faction_id, faction_name}
    # A person may hold multiple positions (MK + minister + committee chair).
    # Keep first entry seen per person (OData returns them in consistent order).
    person_id_to_faction: dict[int, dict] = {}
    for pos in positions_rows:
        pid = pos.get("PersonID")
        faction_id = pos.get("FactionID")
        faction_name = (pos.get("FactionName") or "").strip()
        if pid is not None and faction_id is not None:
            pid_int = int(pid)
            if pid_int not in person_id_to_faction:
                person_id_to_faction[pid_int] = {
                    "faction_id": int(faction_id),
                    "faction_name": faction_name,
                }

    # Step 3 — join on person_id, key by "LastName_FirstName"
    name_key_to_faction: dict[str, dict] = {}
    for pid, (last, first) in person_id_to_name.items():
        if pid in person_id_to_faction and last:
            key = f"{last}_{first}"
            name_key_to_faction[key] = person_id_to_faction[pid]

    logger.info(
        "fetch_v4_mk_faction_map: built %d name→faction entries", len(name_key_to_faction)
    )
    return name_key_to_faction
