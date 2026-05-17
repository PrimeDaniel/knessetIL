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

import httpx
import pandas as pd

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# ── Verified CSV URLs (from datapackage.json inspection, 2026-03-12) ──────────
# Base: https://production.oknesset.org/pipelines/data/
DATASET_URLS: dict[str, str] = {
    # Members — 1,166 rows
    "mk_individual": "members/mk_individual/mk_individual.csv",
    # Faction history — 4,503 rows
    "mk_individual_factions": "members/mk_individual/mk_individual_factions.csv",
    # Party master list
    "factions": "members/mk_individual/factions.csv",
    # Bills — 60,088 rows, 14 MB, PascalCase columns
    "kns_bill": "bills/kns_bill/kns_bill.csv",
    # Bill initiators — 169,562 rows (uses PersonID, not mk_individual_id)
    "kns_billinitiator": "bills/kns_billinitiator/kns_billinitiator.csv",
    # Vote results — 24,744 rows, aggregate totals only
    "view_vote_rslts_hdr_approved": "votes/view_vote_rslts_hdr_approved/view_vote_rslts_hdr_approved.csv",
    # MK vote lookup — 1,111 rows (vip_id → mk_individual_id mapping ONLY)
    "view_vote_mk_individual": "votes/view_vote_mk_individual/view_vote_mk_individual.csv",
    # Per-MK vote decisions — 1,275,825 rows (vote_id, kmmbr_id, kmmbr_name,
    # vote_result [1=for 2=against 3=abstain 0=absent 4=not_participating],
    # knesset_num, faction_id, faction_name)
    "vote_rslts_kmmbr_shadow": "votes/vote_rslts_kmmbr_shadow/vote_rslts_kmmbr_shadow.csv",
}


def _csv_url(dataset: str) -> str:
    path = DATASET_URLS[dataset]
    return f"{settings.oknesset_base_url}/{path}"


# ── Shared HTTP client (connection pooling) ───────────────────────────────────
# Created lazily, closed via shutdown_http_client() in app lifespan.

_http_client: httpx.AsyncClient | None = None


def _get_http_client() -> httpx.AsyncClient:
    """Get or create the shared httpx client for all HTTP requests."""
    global _http_client
    if _http_client is None or _http_client.is_closed:
        _http_client = httpx.AsyncClient(
            timeout=90.0,
            follow_redirects=True,
            limits=httpx.Limits(
                max_connections=20,
                max_keepalive_connections=10,
                keepalive_expiry=30,
            ),
        )
    return _http_client


async def shutdown_http_client() -> None:
    """Close the shared HTTP client.  Called from app lifespan shutdown."""
    global _http_client
    if _http_client is not None and not _http_client.is_closed:
        await _http_client.aclose()
        _http_client = None
    logger.info("Shared HTTP client closed")


async def fetch_csv(dataset: str, timeout: float = 90.0) -> pd.DataFrame:
    """
    Download a CSV dataset from oknesset and return it as a pandas DataFrame.
    Called only by the sync job — services read from PostgreSQL, not DataFrames.
    """
    url = _csv_url(dataset)
    logger.info("Fetching CSV: %s", url)

    client = _get_http_client()
    response = await client.get(url, timeout=timeout)
    response.raise_for_status()

    df = pd.read_csv(io.StringIO(response.text), low_memory=False, encoding="utf-8")
    logger.info("Fetched %s: %d rows, %d cols", dataset, len(df), len(df.columns))
    return df


# ── Knesset OData v4 API ──────────────────────────────────────────────────────
# Base: https://knesset.gov.il/OdataV4/ParliamentInfo
# Provides CURRENT Knesset 25 data (2022–present), unlike frozen Open Knesset CSVs.

KNESSET_V4_BASE = "https://knesset.gov.il/OdataV4/ParliamentInfo"

# ResultCode values in KNS_PlenumVoteResult
V4_RESULT_CODE_MAP: dict[int, str] = {
    7: "for",  # בעד
    8: "against",  # נגד
    9: "abstain",  # נמנע
    6: "absent",  # נוכח (present-but-not-voting, treated as absent)
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

    client = _get_http_client()
    response = await client.get(url, params=merged_params, timeout=timeout)
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
    first_url = url

    client = _get_http_client()
    while url:
        if url == first_url:
            response = await client.get(url, params=merged_params, timeout=timeout)
        else:
            response = await client.get(url, timeout=timeout)
        response.raise_for_status()
        data = response.json()
        all_rows.extend(data.get("value", []))
        url = data.get("@odata.nextLink")

    return all_rows


async def fetch_v4_votes_page(page: int = 1, limit: int = 20) -> dict:
    """
    Fetch a paginated page of votes from ``KNS_PlenumVote`` with per-MK results
    expanded inline, sorted newest first.

    Uses ``$expand=VoteResults`` to fetch vote headers and all per-MK results
    in a single request (eliminates the previous N+1 query pattern).

    Returns the raw OData envelope::

        {
            "value": [ {..., "VoteResults": [{...}, ...]}, ... ],
            "@odata.count": 12345,   # total across all pages
        }
    """
    skip = (page - 1) * limit
    params = {
        "$top": limit,
        "$skip": skip,
        "$count": "true",
        "$orderby": "VoteDateTime desc",
        "$expand": "VoteResults",
    }
    try:
        return await fetch_v4("KNS_PlenumVote", params=params)
    except Exception as exc:
        logger.error("fetch_v4_votes_page(page=%d, limit=%d) failed: %s", page, limit, exc)
        return {"value": [], "@odata.count": 0}


async def fetch_v4_vote_with_results(vote_id: int) -> dict | None:
    """
    Fetch a single ``KNS_PlenumVote`` row with its ``VoteResults`` expanded inline.

    Returns the vote row dict with an embedded ``VoteResults`` list, or ``None``
    if the vote is not found.  This replaces the previous pattern of making
    separate requests for vote header + results.
    """
    try:
        data = await fetch_v4(
            "KNS_PlenumVote",
            params={
                "$filter": f"Id eq {vote_id}",
                "$expand": "VoteResults",
            },
        )
        rows = data.get("value", [])
        return rows[0] if rows else None
    except Exception as exc:
        logger.error("fetch_v4_vote_with_results(vote_id=%d) failed: %s", vote_id, exc)
        return None


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


async def fetch_v4_bill_item_ids(bill_id: int) -> list[int]:
    """
    Fetch ItemIDs linked to a bill by searching ``KNS_PlmSessionItem``.

    ``KNS_PlmSessionItem`` represents items on the plenum session agenda.
    It has ``ItemID`` (pointing to the original entity like a bill) and a
    ``Name`` field.  Unfortunately ``KNS_PlmSessionItem`` does NOT have a
    direct ``BillID`` column, so we filter by ItemTypeID=2 (bill type) and
    match on ItemID.

    We also try to find votes that reference the bill_id directly via
    ``KNS_PlenumVote.ItemID``, since for many bills the ItemID in the vote
    table equals the BillID.

    Returns a list of ItemIDs that may be associated with this bill.
    """
    ids: list[int] = []

    # Strategy 1: Check if any plenum session items reference this bill
    try:
        data = await fetch_v4(
            "KNS_PlmSessionItem",
            params={"$filter": f"ItemID eq {bill_id}"},
        )
        for item in data.get("value", []):
            item_id = item.get("ItemID") or item.get("Id")
            if item_id is not None:
                ids.append(int(item_id))
    except Exception as exc:
        logger.warning(
            "fetch_v4_bill_item_ids: KNS_PlmSessionItem query failed for bill_id=%d: %s",
            bill_id,
            exc,
        )

    # Always include the bill_id itself as a candidate ItemID
    if bill_id not in ids:
        ids.append(bill_id)

    return ids


async def fetch_v4_bills_page(
    page: int = 1,
    limit: int = 20,
    knesset_num: int | None = None,
    status_ids: list[int] | None = None,
    search: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
) -> dict:
    """
    Fetch a paginated page of bills from ``KNS_Bill``, sorted by LastUpdatedDate desc.

    Uses ``$expand=KNS_BillInitiator($expand=KNS_Person)`` to fetch initiator
    names inline — eliminates the empty ``initiators: []`` for v4 bills.

    ``status_ids`` must already be translated to OData v4 StatusID values
    (100-180 range); callers are responsible for the canonical→v4 mapping.

    Returns the raw OData envelope::

        {
            "value": [ {..., "KNS_BillInitiator": [{..., "KNS_Person": {...}}, ...]}, ... ],
            "@odata.count": 12345,
        }
    """
    skip = (page - 1) * limit
    params: dict = {
        "$top": limit,
        "$skip": skip,
        "$count": "true",
        "$orderby": "LastUpdatedDate desc",
        "$expand": "KNS_BillInitiator($expand=KNS_Person)",
    }

    filters: list[str] = []
    if knesset_num is not None:
        filters.append(f"KnessetNum eq {knesset_num}")
    if status_ids:
        if len(status_ids) == 1:
            filters.append(f"StatusID eq {status_ids[0]}")
        else:
            or_parts = " or ".join(f"StatusID eq {sid}" for sid in status_ids)
            filters.append(f"({or_parts})")
    if search:
        escaped = search.replace("'", "''")
        filters.append(f"contains(Name, '{escaped}')")
    if date_from:
        filters.append(f"PublicationDate ge {date_from}T00:00:00")
    if date_to:
        filters.append(f"PublicationDate le {date_to}T23:59:59")
    if filters:
        params["$filter"] = " and ".join(filters)

    try:
        return await fetch_v4("KNS_Bill", params=params)
    except Exception as exc:
        logger.error("fetch_v4_bills_page(page=%d, limit=%d) failed: %s", page, limit, exc)
        return {"value": [], "@odata.count": 0}


async def fetch_v4_bill_detail(bill_id: int) -> dict | None:
    """
    Fetch a single KNS_Bill with initiators and their person info expanded inline.

    The OData v4 primary key for KNS_Bill is ``Id`` (not ``BillID``).
    Returns the bill row dict or None if not found.
    """
    # Try with $expand first
    try:
        data = await fetch_v4(
            "KNS_Bill",
            params={
                "$filter": f"Id eq {bill_id}",
                "$expand": "KNS_BillInitiator($expand=KNS_Person)",
            },
        )
        rows = data.get("value", [])
        if rows:
            return rows[0]
    except Exception as exc:
        logger.debug(
            "fetch_v4_bill_detail: $expand failed for bill_id=%d, trying without: %s", bill_id, exc
        )

    # Fallback: fetch without $expand (some v4 endpoints reject nested expands)
    try:
        data = await fetch_v4(
            "KNS_Bill",
            params={"$filter": f"Id eq {bill_id}"},
        )
        rows = data.get("value", [])
        return rows[0] if rows else None
    except Exception as exc:
        logger.warning("fetch_v4_bill_detail: failed for bill_id=%d: %s", bill_id, exc)
        return None


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
                params={"$filter": "KnessetNum eq 25 and FactionID ne null and IsCurrent eq true"},
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

    logger.info("fetch_v4_mk_faction_map: built %d name→faction entries", len(name_key_to_faction))
    return name_key_to_faction


async def fetch_v4_current_knesset_members() -> list[dict]:
    """
    Fetch all current Knesset 25 members from OData v4.

    Joins:
    - KNS_PersonToPosition (KnessetNum=25, IsCurrent=true) → PersonID + faction
    - KNS_Person (IsCurrent=true) → FirstName + LastName

    Deduplicates by PersonID (one row per MK even if they hold multiple positions).
    Returns a list of dicts with keys:
        person_id, first_name, last_name, full_name, faction_id, faction_name,
        gender_desc, email
    """
    import asyncio

    try:
        positions_rows, persons_rows = await asyncio.gather(
            fetch_v4_all(
                "KNS_PersonToPosition",
                params={"$filter": "KnessetNum eq 25 and IsCurrent eq true"},
            ),
            fetch_v4_all(
                "KNS_Person",
                params={"$filter": "IsCurrent eq true"},
            ),
        )
    except Exception as exc:
        logger.error("fetch_v4_current_knesset_members: failed: %s", exc)
        return []

    # person_id -> name/gender/email info
    person_map: dict[int, dict] = {}
    for p in persons_rows:
        pid = p.get("Id")
        if pid is not None:
            person_map[int(pid)] = {
                "first_name": (p.get("FirstName") or "").strip(),
                "last_name": (p.get("LastName") or "").strip(),
                "gender_desc": (p.get("GenderDesc") or "").strip(),
                "email": p.get("Email"),
            }

    # Deduplicate: one entry per person (first faction seen wins)
    seen: set[int] = set()
    result: list[dict] = []
    for pos in positions_rows:
        pid = pos.get("PersonID")
        if pid is None:
            continue
        pid_int = int(pid)
        if pid_int in seen:
            continue
        seen.add(pid_int)

        person = person_map.get(pid_int, {})
        first = person.get("first_name", "")
        last = person.get("last_name", "")
        full_name = f"{first} {last}".strip() if first and last else first or last

        result.append(
            {
                "person_id": pid_int,
                "first_name": first,
                "last_name": last,
                "full_name": full_name,
                "faction_id": int(pos["FactionID"]) if pos.get("FactionID") else None,
                "faction_name": (pos.get("FactionName") or "").strip(),
                "gender_desc": person.get("gender_desc", ""),
                "email": person.get("email"),
            }
        )

    logger.info("fetch_v4_current_knesset_members: %d current K25 members", len(result))
    return result
