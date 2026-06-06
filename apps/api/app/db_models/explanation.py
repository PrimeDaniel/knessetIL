"""
SQLAlchemy model for AI-generated plain-language explanations.

`ai_explanations` is a write-once cache: the first time a user asks for an
explanation of a specific bill or vote, we generate it with Claude and store it
here.  Every later request — from any process — serves the stored text instead
of paying for another model call.

  key            "{subject_type}:{subject_id}", e.g. "vote:1234" / "bill:5678"
  subject_type   "bill" | "vote"
  subject_id     the BillID / vote_id this explains
  content        the Hebrew explanation text
  model          the model that produced it (for auditing / future re-gen)
  created_at     when it was generated
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AiExplanation(Base):
    __tablename__ = "ai_explanations"

    key: Mapped[str] = mapped_column(String, primary_key=True)
    subject_type: Mapped[str] = mapped_column(String, nullable=False)
    subject_id: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    model: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
