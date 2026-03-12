from __future__ import annotations
from pydantic import BaseModel, Field


class FactionRef(BaseModel):
    id: int
    name: str
    knesset_num: int


class FactionMembership(BaseModel):
    faction_id: int
    faction_name: str
    start_date: str
    finish_date: str | None = None
    knesset_num: int


class Position(BaseModel):
    position_id: int
    position_name: str
    body_name: str | None = None
    start_date: str | None = None
    finish_date: str | None = None


class MKProfile(BaseModel):
    mk_individual_id: int
    mk_individual_name: str
    mk_individual_name_eng: str
    mk_individual_first_name: str
    mk_individual_first_name_eng: str
    mk_individual_photo: str | None = None
    mk_individual_email: str | None = None
    mk_individual_phone: str | None = None
    gender_desc: str
    is_current: bool
    knessets: list[int] = Field(default_factory=list)
    current_faction: FactionRef | None = None
    faction_history: list[FactionMembership] = Field(default_factory=list)
    positions: list[Position] = Field(default_factory=list)


class MKStats(BaseModel):
    mk_individual_id: int
    total_votes: int = 0
    votes_for: int = 0
    votes_against: int = 0
    votes_abstain: int = 0
    votes_absent: int = 0
    rebellion_rate: float = 0.0   # 0–1
    attendance_rate: float = 0.0  # 0–1
    bills_proposed: int = 0
    current_term_votes: int = 0
    current_term_rebellion_rate: float = 0.0


class Pagination(BaseModel):
    page: int
    limit: int
    total: int
    total_pages: int


class MKListResponse(BaseModel):
    data: list[MKProfile]
    pagination: Pagination
    cached_at: str
