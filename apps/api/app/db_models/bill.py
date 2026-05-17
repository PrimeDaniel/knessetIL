"""
SQLAlchemy models for kns_bill.csv and kns_billinitiator.csv.

kns_bill.csv columns (PascalCase in source):
  BillID, KnessetNum, Name, SubTypeID, SubTypeDesc, PrivateNumber, CommitteeID,
  StatusID, PublicationDate, IsContinuationBill, SummaryLaw

kns_billinitiator.csv columns:
  BillInitiatorID, BillID, PersonID, IsInitiator, Ordinal
  NOTE: PersonID maps to members.person_id, not members.mk_individual_id.
"""

from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy import Boolean, Date, DateTime, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Bill(Base):
    __tablename__ = "bills"
    __table_args__ = (
        Index("ix_bills_knesset_status", "knesset_num", "status_id"),
        Index("ix_bills_publication_date", "publication_date"),
    )

    bill_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    knesset_num: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str | None] = mapped_column(String, nullable=True)
    sub_type_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sub_type_desc: Mapped[str | None] = mapped_column(String, nullable=True)
    status_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    private_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    publication_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    is_continuation: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    summary_law: Mapped[str | None] = mapped_column(Text, nullable=True)

    synced_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )


class BillInitiator(Base):
    __tablename__ = "bill_initiators"
    __table_args__ = (
        Index("ix_bill_initiators_bill_id", "bill_id"),
        Index("ix_bill_initiators_person_id", "person_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    bill_id: Mapped[int] = mapped_column(Integer, nullable=False)
    # PersonID from CSV — joins to members.person_id
    person_id: Mapped[int] = mapped_column(Integer, nullable=False)
    is_initiator: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    ordinal: Mapped[int | None] = mapped_column(Integer, nullable=True)

    synced_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
