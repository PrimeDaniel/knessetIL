"""
SQLAlchemy model for the persistent lazy-cache table.

`cache_entries` backs the stale-while-revalidate cache in
``app.services.cache_service``.  Once any request (from any process) computes an
expensive OData response, it is written here so subsequent requests — and fresh
process restarts — serve it instantly instead of re-hitting the slow upstream API.

  key              cache key (same namespace as the in-memory store)
  value            the cached JSON payload (a response dict)
  soft_expires_at  when the entry goes stale; past this it is still served but a
                   background refresh is triggered
  updated_at       last time the value was (re)computed
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import DateTime, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class CacheEntry(Base):
    __tablename__ = "cache_entries"

    key: Mapped[str] = mapped_column(String, primary_key=True)
    value: Mapped[dict] = mapped_column(JSONB, nullable=False)
    soft_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
