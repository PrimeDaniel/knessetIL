"""
SQLAlchemy model for factions.csv.

factions.csv columns:
  id, name, start_date, finish_date, knessets (JSON array string like '[25]')
"""

from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy import Date, DateTime, Integer, String
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Faction(Base):
    __tablename__ = "factions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    finish_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    # Stored as PostgreSQL integer array; CSV source is a JSON string like '[24, 25]'
    knessets: Mapped[list[int]] = mapped_column(ARRAY(Integer), nullable=False, default=list)

    synced_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    @property
    def is_active(self) -> bool:
        return self.finish_date is None
