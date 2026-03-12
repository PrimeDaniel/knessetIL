from __future__ import annotations
from datetime import date
from typing import Literal
from pydantic import BaseModel, Field


VoteDecision = Literal["for", "against", "abstain", "absent"]


class PartyVoteBreakdown(BaseModel):
    faction_id: int
    faction_name: str
    for_count: int
    against_count: int
    abstain_count: int
    absent_count: int
    total_members: int


class MKVoteRecord(BaseModel):
    vote_id: int
    mk_individual_id: int
    mk_name: str
    mk_name_eng: str
    faction_id: int | None
    faction_name: str | None
    decision: VoteDecision
    vote_date: str
    vote_item_dscr: str


class VoteResult(BaseModel):
    id: int
    knesset_num: int
    session_id: int
    vote_date: str
    vote_time: str | None = None
    vote_item_id: int
    vote_item_dscr: str
    vote_type: str | None = None
    is_accepted: bool
    total_for: int = 0
    total_against: int = 0
    total_abstain: int = 0
    total_absent: int = 0


class VoteDetail(VoteResult):
    party_breakdown: list[PartyVoteBreakdown] = Field(default_factory=list)
    mk_votes: list[MKVoteRecord] = Field(default_factory=list)


class Pagination(BaseModel):
    page: int
    limit: int
    total: int
    total_pages: int


class VoteListResponse(BaseModel):
    data: list[VoteResult]
    pagination: Pagination
    cached_at: str
