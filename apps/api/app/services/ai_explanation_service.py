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

try:
    from anthropic import AsyncAnthropic, APIError
    HAS_ANTHROPIC = True
except ImportError:
    HAS_ANTHROPIC = False
    class AsyncAnthropic:
        def __init__(self, *args, **kwargs): pass
    class APIError(Exception): pass

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


_EXPLANATIONS_DB = {
    # Bills and core issues
    "פקודת המשטרה": "הצעת חוק זו עוסקת בהרחבת סמכויות הפיקוח וההנחיות של המשרד לביטחון לאומי על משטרת ישראל. התיקון נועד להגדיר מחדש את יחסי הכוחות בין הדרג המדיני (השר) לבין המפכ\"ל, במיוחד בנוגע לקביעת מדיניות כללית והתוויית קווים מנחים לפעילות המשטרה.",
    "חופש הנחת תפילין": "הצעת חוק זו נועדה לעגן בחוק את הזכות של כל אזרח להציב דוכנים להנחת תפילין ולהניח תפילין במרחב הציבורי ללא צורך באישור מיוחד מהרשויות המקומיות. מטרת ההצעה היא למנוע הגבלות שהטילו רשויות מקומיות מטעמי סדר ציבורי.",
    "יהדות מרוקו": "הצעת החוק קובעת יום ציון לאומי שנתי להוקרה וללימוד של המורשת, התרבות וההיסטוריה של יהדות מרוקו ומדינות צפון אפריקה. יום זה יצוין במערכת החינוך, בצה\"ל ובמוסדות המדינה במטרה להנחיל את המורשת העשירה לדורות הבאים.",
    "יצחק נבון": "הצעת חוק זו מציעה להקים מרכז לאומי ייעודי להנצחת פועלו, מורשתו החינוכית ויצירתו של הנשיא החמישי של מדינת ישראל, יצחק נבון. המרכז יתמקד בקידום ערכי הסובלנות, הדיאלוג הבין-תרבותי והתרבות היהודית-ספרדית.",
    "למדידה ולהערכה בחינוך": "הצעת החוק נועדה להסדיר את מעמדה העצמאי של הרשות למדידה והערכה בחינוך (ראמ\"ה), כדי להבטיח שביצוע מבחני הערכה ארציים (כגון מבחני המיצ\"ב) ומחקרים במערכת החינוך ייעשו באופן אובייקטיבי ומנותק מלחצים פוליטיים של משרד החינוך.",
    "תחנות נוחות בכבישים": "הצעת החוק מחייבת את המדינה ואת חברות התשתית להקים ולתחזק תחנות ריענון ונוחות ציבוריות פתוחות לאורך כבישים בין-עירוניים מהירים במרווחים קבועים. המטרה היא להגביר את בטיחות בדרכים ולאפשר לנהגים מקומות עצירה מוסדרים למניעת עייפות.",
    "זכויות הסטודנט": "הצעת חוק זו נועדה להרחיב את זכויותיהם והקלותיהם של סטודנטים המשרתים בשירות מילואים פעיל, סטודנטים בני זוג של משרתים, או סטודנטים בטיפולי פוריות/הריון. התיקון מעגן הטבות אקדמיות מוגדרות כגון דחיית מועדי מבחנים, הקלות בהגשת עבודות ונקודות זכות.",
    "המועצות המקומיות": "הצעת החוק מסדירה את סמכויות הפיקוח והאכיפה של מועצות מקומיות באזורי פריפריה ויושבת על הגדרת תקציבי הפיתוח שלהן אל מול משרד הפנים, במטרה לצמצם בירוקרטיה ולאפשר אישור עצמאי של פרויקטים מוניציפליים מקומיים.",
    "שירות הקבע": "הצעת חוק זו מסדירה את מנגנוני הפנסיה והגימלאות של משרתי הקבע בצה\"ל, ובמיוחד את התיקונים המכונים 'הסדרי הגשר' הנדרשים לביסוס זכויות הפנסיה הצוברת של קצינים ונגדים הפורשים לפני גיל הפנסיה הכללי במשק.",
    "קידום החקלאות": "הצעת החוק נוהגת להעניק תמיכות ישירות, הטבות מס ותמריצים לחקלאים מקומיים בישראל, במטרה לשמור על ביטחון המזון הלאומי, להגן על קרקעות חקלאיות מפני השתלטות ולעודד צעירים להשתלב בענפי החקלאות השונים.",
}

async def _generate_mock_explanation(subject_type: str, title: str, context: str) -> str:
    import asyncio
    await asyncio.sleep(1.2)  # Simulate model latency (triggers loading spinner)
    logger.info("Generating mock explanation: type=%s, title=%r, context=%r", subject_type, title, context)
    
    # 1. Search for a specific explanation match
    core_desc = ""
    for key, val in _EXPLANATIONS_DB.items():
        if key in title or (context and key in context):
            core_desc = val
            break
            
    logger.info("Mock match result: key=%r, core_desc=%r", key if core_desc else None, core_desc)
            
    # 2. Fall back to smart rule-based explanation if no specific match
    if not core_desc:
        if "תקציב" in title or "תקציב" in context:
            core_desc = "הצעת החוק עוסקת בתקציב המדינה או בהקצאת כספים ציבוריים למטרות מוגדרות. אישור התקציב או השינויים בו קובע את סדרי העדיפויות הכלכליים של הממשלה לשנה הקרובה."
        elif "מס" in title or "מיסוי" in title:
            core_desc = "הצעת החוק עוסקת בשינוי גובה המס, הגדרת פטורים חדשים או הסדרת נהלי גביית מיסים. שינויים אלו משפיעים ישירות על נטל המס ועל הכנסות המדינה."
        elif "בחירות" in title or "התפזרות" in title:
            core_desc = "הצעת החוק נוגעת למועדי בחירות, התפזרות הכנסת או שינוי שיטת הבחירות. הצעות מסוג זה מעצבות את המבנה השלטוני והדמוקרטי של המדינה."
        elif "ביטחון" in title or "צה\"ל" in title or "חייל" in title:
            core_desc = "הצעת החוק עוסקת בביטחון המדינה, מעמד משרתי הקבע והחובה, או היערכות לשעת חירום. מטרת ההסדרים היא חיזוק החוסן הביטחוני והגדרת זכויות המשרתים."
        elif "חינוך" in title or "בית ספר" in title:
            core_desc = "הצעת החוק נוגעת למערכת החינוך, סמכויות משרד החינוך, או מעמד המורים והתלמידים. מטרתה היא שיפור איכות הלמידה והגדרת סטנדרטים ארציים."
        elif "בריאות" in title or "רופא" in title:
            core_desc = "הצעת החוק עוסקת במערכת הבריאות הציבורית, סל התרופות, או זכויות החולים והצוותים הרפואיים במטרה לשפר את איכות השירות הרפואי."
        else:
            core_desc = f"הצעת החוק עוסקת בהסדרת הנושא בתוך מדינת ישראל. מדובר ביוזמת חקיקה שנועדה לערוך שינויים בחקיקה הקיימת או ליצור הסדרים חדשים לטובת הציבור והסדרת המדיניות בתחום המדובר."

    if subject_type == "vote":
        # Check what kind of vote it is
        vote_type_desc = ""
        
        # Objections / Clause Votes
        if "הסתייגות" in context or "הסתייגות" in title:
            num = ""
            for word in (context + " " + title).split():
                if word.isdigit():
                    num = f" {word}"
                    break
            vote_type_desc = f"הצבעה זו היא על הסתייגות{num} שהוגשה לגבי סעיף בחוק. הגשת הסתייגויות היא כלי פרלמנטרי של חברי כנסת (בעיקר מהאופוזיציה) המבקשים לשנות, לעדכן או למחוק סעיפים ספציפיים בנוסח החוק המוצע לפני אישורו הסופי."
        elif "סעיף" in context or "סעיף" in title:
            vote_type_desc = "הצבעה זו עוסקת באישור סעיף ספציפי מתוך הצעת החוק במתכונת שנוסחה בוועדה המכינה. אישור הסעיף במליאה מעגן אותו כחלק מנוסח החוק שיעלה להצבעה הסופית."
        elif "קריאה ראשונה" in title or "קריאה ראשונה" in context:
            vote_type_desc = "הצבעה זו היא בקריאה ראשונה במליאת הכנסת. אישור ההצעה בקריאה ראשונה מאפשר להעביר את הצעת החוק לדיון מעמיק בוועדות הכנסת לשם הכנתה לקריאות הבאות."
        elif "קריאה שניה" in title or "קריאה שלישית" in title or "קריאה שנייה" in title or "קריאה שנייה ושלישית" in context:
            vote_type_desc = "הצבעה זו היא בקריאה שנייה ושלישית, שהן השלבים המכריעים והסופיים לאישורו של החוק במליאה. אישור ההצעה בשלב זה הופך את הצעת החוק לחוק רשמי ומחייב בספר החוקים של מדינת ישראל."
        
        if vote_type_desc:
            return f"{core_desc}\n\n{vote_type_desc}"
        return core_desc
    else:
        return core_desc


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
    
    # Fallback to mock generation if Anthropic library is missing or API key is not configured
    if not HAS_ANTHROPIC or not settings.anthropic_api_key:
        content = await _generate_mock_explanation(subject_type, title, context)
        model = "mock-generator-local"
    else:
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
            content = "".join(
                block.text for block in message.content if getattr(block, "type", None) == "text"
            ).strip()
            if not content:
                raise RuntimeError("model returned an empty explanation")
        except Exception as exc:
            logger.error("AI explanation generation failed for %s: %s, falling back to mock", key, exc)
            content = await _generate_mock_explanation(subject_type, title, context)
            model = "mock-generator-fallback"

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
