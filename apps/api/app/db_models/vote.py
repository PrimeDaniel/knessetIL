"""
SQLAlchemy models for vote CSVs.

view_vote_rslts_hdr_approved.csv columns:
  vote_id, knesset_num, session_id, sess_item_dscr, vote_item_id, vote_item_dscr,
  vote_date, vote_time, vote_type, is_accepted (0/1), total_for, total_against, total_abstain

vote_rslts_kmmbr_shadow.csv columns (~1.27M rows):
  vote_id, kmmbr_id, kmmbr_name, vote_result (1=for 2=against 3=abstain 0=absent 4=absent),
  knesset_num, faction_id, faction_name
"""

from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy import Boolean, Date, DateTime, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

# Map CSV integer result codes to canonical strings stored in the DB
VOTE_RESULT_MAP: dict[int, str] = {
    1: "for",
    2: "against",
    3: "abstain",
    0: "absent",
    4: "absent",  # "not_participating" treated same as absent
}


class VoteHeader(Base):
    __tablename__ = "vote_headers"
    __table_args__ = (Index("ix_vote_headers_knesset_date", "knesset_num", "vote_date"),)

    vote_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    knesset_num: Mapped[int | None] = mapped_column(Integer, nullable=True)
    session_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sess_item_dscr: Mapped[str | None] = mapped_column(String, nullable=True)
    vote_item_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    vote_item_dscr: Mapped[str | None] = mapped_column(String, nullable=True)
    vote_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    vote_time: Mapped[str | None] = mapped_column(String(8), nullable=True)
    vote_type: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_accepted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    total_for: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_against: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_abstain: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    synced_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )


class VoteDecision(Base):
    __tablename__ = "vote_decisions"
    __table_args__ = (
        UniqueConstraint("vote_id", "member_id", name="uq_vote_decision"),
        Index("ix_vote_decisions_member_id", "member_id"),
        Index("ix_vote_decisions_faction_id", "faction_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    vote_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    # kmmbr_id from CSV — maps to members.mk_individual_id via view_vote_mk_individual
    member_id: Mapped[int] = mapped_column(Integer, nullable=False)
    member_name: Mapped[str | None] = mapped_column(String, nullable=True)
    # 'for', 'against', 'abstain', 'absent' (mapped from CSV integer codes)
    result: Mapped[str] = mapped_column(String(10), nullable=False)
    knesset_num: Mapped[int | None] = mapped_column(Integer, nullable=True)
    faction_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    faction_name: Mapped[str | None] = mapped_column(String, nullable=True)

    synced_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
