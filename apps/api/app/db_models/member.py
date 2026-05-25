"""
SQLAlchemy models for mk_individual.csv and mk_individual_factions.csv.

mk_individual columns (snake_case originals):
  mk_individual_id, PersonID, mk_individual_name (family name), mk_individual_name_eng,
  mk_individual_first_name, mk_individual_first_name_eng, mk_individual_photo,
  mk_individual_email, IsCurrent, GenderDesc

mk_individual_factions columns:
  mk_individual_id, faction_id, faction_name, start_date, finish_date, knesset (int)
"""

from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy import Boolean, Date, DateTime, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Member(Base):
    __tablename__ = "members"

    mk_individual_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # PersonID from CSV = MkId from MkLobby API = KNS_Person.Id in OData v4
    person_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)

    last_name: Mapped[str | None] = mapped_column(String, nullable=True)
    last_name_eng: Mapped[str | None] = mapped_column(String, nullable=True)
    first_name: Mapped[str | None] = mapped_column(String, nullable=True)
    first_name_eng: Mapped[str | None] = mapped_column(String, nullable=True)

    photo_url: Mapped[str | None] = mapped_column(String, nullable=True)
    email: Mapped[str | None] = mapped_column(String, nullable=True)
    phone: Mapped[str | None] = mapped_column(String, nullable=True)
    gender_desc: Mapped[str | None] = mapped_column(String, nullable=True)
    is_current: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)
    is_coalition: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    synced_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    @property
    def full_name(self) -> str:
        parts = [p for p in [self.first_name, self.last_name] if p]
        return " ".join(parts)

    @property
    def full_name_eng(self) -> str:
        parts = [p for p in [self.first_name_eng, self.last_name_eng] if p]
        return " ".join(parts)


class MemberFaction(Base):
    __tablename__ = "member_factions"
    __table_args__ = (
        UniqueConstraint(
            "mk_individual_id", "faction_id", "start_date", name="uq_member_faction_start"
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    mk_individual_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    faction_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    faction_name: Mapped[str | None] = mapped_column(String, nullable=True)
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    finish_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    knesset_num: Mapped[int | None] = mapped_column(Integer, nullable=True)

    synced_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
