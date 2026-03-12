from __future__ import annotations
from pydantic import BaseModel, Field


class Faction(BaseModel):
    id: int
    name: str
    start_date: str
    finish_date: str | None = None
    knessets: list[int] = Field(default_factory=list)
    member_count: int = 0
    cohesion_score: float | None = None  # 0–1


class FactionMemberSummary(BaseModel):
    mk_individual_id: int
    mk_individual_name: str
    is_current: bool
    rebellion_rate: float


class FactionDetail(Faction):
    members: list[FactionMemberSummary] = Field(default_factory=list)


class RecentCohesionPoint(BaseModel):
    vote_date: str
    cohesion: float
    vote_item_dscr: str


class FactionCohesionData(BaseModel):
    faction_id: int
    faction_name: str
    cohesion_score: float
    total_votes_analyzed: int
    recent_cohesion: list[RecentCohesionPoint] = Field(default_factory=list)


class Pagination(BaseModel):
    page: int
    limit: int
    total: int
    total_pages: int


class PartyListResponse(BaseModel):
    data: list[Faction]
    pagination: Pagination
    cached_at: str
