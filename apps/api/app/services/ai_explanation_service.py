"""
AI explanation service — short, plain-language Hebrew explanations of bills/votes.

Flow (write-once cache):
  1. Look up "{subject_type}:{subject_id}" in the `ai_explanations` table.
  2. Hit  → return the stored text (no model call).
  3. Miss → call Claude Haiku 4.5 with the caller-supplied context, store the
            result, and return it.  First-writer-wins: once a row exists, the
            stored text is authoritative and later requests never regenerate.

Why Haiku: explanations are short and read from our own structured data, so the
cheapest current model is the right fit.  No web access, no thinking — one call.

The system prompt is a frozen module constant with a `cache_control` breakpoint
so it is eligible for prompt caching across requests once it exceeds the model's
minimum cacheable prefix (4096 tokens on Haiku 4.5).  It is well below that today,
so caching is a no-op for now — but keeping the prompt stable and marked means we
get the discount automatically if it ever grows, and costs nothing in the meantime.
"""

from __future__ import annotations

import logging

from anthropic import AsyncAnthropic, APIError
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db_models.explanation import AiExplanation

logger = logging.getLogger(__name__)

_VALID_TYPES = {"bill", "vote"}

# Frozen across requests — keep byte-identical so the cache_control breakpoint holds.
_SYSTEM_PROMPT = (
    "אתה מסביר לציבור הרחב בישראל פעולות פרלמנטריות של הכנסת בשפה פשוטה וברורה. "
    "קיבלת מידע על הצעת חוק או הצבעה. כתוב הסבר קצר (2–3 משפטים) שמסביר במילים פשוטות "
    "מה הנושא ומה המשמעות המעשית עבור האזרח.\n"
    "כללים נוקשים:\n"
    "- הסתמך אך ורק על המידע שסופק. אל תמציא פרטים, מספרים, שמות או תאריכים שלא נמסרו.\n"
    "- אם המידע דל, תן הסבר כללי על סוג הפעולה הפרלמנטרית הזו, בלי להמציא את תוכנה.\n"
    "- שמור על ניטרליות פוליטית מוחלטת. אל תביע דעה ואל תנקוט עמדה.\n"
    "- כתוב בעברית בלבד, בגוף שלישי, בלי פנייה לקורא ובלי הקדמות כמו 'הנה ההסבר'.\n"
    "- החזר רק את טקסט ההסבר עצמו."
)

# Lazily-built singleton client (reused across requests).
_client: AsyncAnthropic | None = None


def _get_client() -> AsyncAnthropic:
    global _client
    if _client is None:
        _client = AsyncAnthropic(api_key=get_settings().anthropic_api_key)
    return _client


def _make_key(subject_type: str, subject_id: int) -> str:
    return f"{subject_type}:{subject_id}"


def _user_prompt(subject_type: str, title: str, context: str | None) -> str:
    label = "הצעת חוק" if subject_type == "bill" else "הצבעה במליאה"
    parts = [f"סוג: {label}", f"כותרת: {title.strip()}"]
    if context and context.strip():
        parts.append(f"פרטים נוספים:\n{context.strip()}")
    return "\n".join(parts)


async def _fetch_subject(
    session: AsyncSession, subject_type: str, subject_id: int
) -> tuple[str, str] | None:
    """
    Fetch the canonical bill/vote record and build ``(title, context)`` from it.

    Built server-side from our own data so the cached explanation can't be
    poisoned by a crafted request body. Returns None if the subject doesn't exist.
    """
    # Imported here (not at module top) to avoid an import cycle at startup.
    from app.services import bills_service, votes_service

    if subject_type == "bill":
        bill = await bills_service.get_bill(subject_id, session)
        if bill is None:
            return None
        title = (bill.get("name") or "").strip() or f"הצעת חוק #{subject_id}"
        context = "\n".join(
            p
            for p in (
                f"סטטוס: {bill.get('status_desc')}" if bill.get("status_desc") else None,
                f"סוג: {bill.get('sub_type_desc')}" if bill.get("sub_type_desc") else None,
                f"כנסת {bill.get('knesset_num')}" if bill.get("knesset_num") else None,
                f"תקציר רשמי: {bill.get('summary_law')}" if bill.get("summary_law") else None,
            )
            if p
        )
        return title, context

    vote = await votes_service.get_vote_detail(subject_id, session)
    if vote is None:
        return None
    item = (vote.get("vote_item_dscr") or "").strip()
    sess = (vote.get("sess_item_dscr") or "").strip()
    title = item or sess or f"הצבעה #{subject_id}"
    context = "\n".join(
        p
        for p in (
            f"תוצאה: {'התקבלה' if vote.get('is_accepted') else 'נדחתה'}",
            f"בעד {vote.get('total_for', 0)}, נגד {vote.get('total_against', 0)}, "
            f"נמנעו {vote.get('total_abstain', 0)}",
            f"כנסת {vote.get('knesset_num')}" if vote.get("knesset_num") else None,
            f"נושא הדיון: {sess}" if sess and sess != item else None,
        )
        if p
    )
    return title, context


async def _load(session: AsyncSession, key: str) -> AiExplanation | None:
    return (
        await session.execute(select(AiExplanation).where(AiExplanation.key == key))
    ).scalar_one_or_none()


async def get_or_generate(
    session: AsyncSession,
    subject_type: str,
    subject_id: int,
) -> tuple[str, bool, str]:
    """
    Return ``(content, cached, model)``.

    ``cached`` is True when served from the DB (no model call was made).
    Raises ValueError for an unknown subject_type, LookupError if the subject
    doesn't exist, and RuntimeError if the model call fails on a cold miss.
    """
    if subject_type not in _VALID_TYPES:
        raise ValueError(f"unknown subject_type: {subject_type!r}")

    key = _make_key(subject_type, subject_id)
    settings = get_settings()

    existing = await _load(session, key)
    if existing is not None:
        return existing.content, True, existing.model

    # Build context from our own canonical data — never from caller input.
    fetched = await _fetch_subject(session, subject_type, subject_id)
    if fetched is None:
        raise LookupError(f"{subject_type} {subject_id} not found")
    title, context = fetched

    model = settings.ai_explanation_model
    try:
        message = await _get_client().messages.create(
            model=model,
            max_tokens=512,
            system=[
                {
                    "type": "text",
                    "text": _SYSTEM_PROMPT,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            messages=[
                {"role": "user", "content": _user_prompt(subject_type, title, context)}
            ],
        )
    except APIError as exc:
        logger.error("AI explanation generation failed for %s: %s", key, exc)
        raise RuntimeError("explanation generation failed") from exc

    content = "".join(
        block.text for block in message.content if getattr(block, "type", None) == "text"
    ).strip()
    if not content:
        raise RuntimeError("model returned an empty explanation")

    # Insert-or-ignore: if a concurrent request already wrote this key, keep that one.
    await session.execute(
        pg_insert(AiExplanation)
        .values(
            key=key,
            subject_type=subject_type,
            subject_id=subject_id,
            content=content,
            model=model,
        )
        .on_conflict_do_nothing(index_elements=["key"])
    )
    await session.commit()

    # Re-read so we return whatever actually won the race (ours or the concurrent one).
    winner = await _load(session, key)
    if winner is not None:
        return winner.content, False, winner.model
    return content, False, model
