from __future__ import annotations
from pydantic import BaseModel, Field


class BillInitiator(BaseModel):
    mk_individual_id: int
    mk_name: str
    mk_name_eng: str
    faction_name: str | None = None


class Bill(BaseModel):
    bill_id: int
    knesset_num: int
    name: str
    name_eng: str | None = None
    status_id: int
    status_desc: str
    sub_type_id: int | None = None
    sub_type_desc: str | None = None
    union_type_id: int | None = None
    publication_date: str | None = None
    publication_num: int | None = None
    summary_law: str | None = None
    is_continuation: bool = False
    initiators: list[BillInitiator] = Field(default_factory=list)


class BillVoteSummary(BaseModel):
    vote_id: int
    vote_date: str
    is_accepted: bool
    total_for: int
    total_against: int
    total_abstain: int


class BillDetail(Bill):
    vote: BillVoteSummary | None = None
    related_bills: list[dict] = Field(default_factory=list)


class Pagination(BaseModel):
    page: int
    limit: int
    total: int
    total_pages: int


class BillListResponse(BaseModel):
    data: list[Bill]
    pagination: Pagination
    cached_at: str
