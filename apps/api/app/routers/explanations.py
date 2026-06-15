"""
Explanations router — on-demand AI plain-language explanations.

POST /api/v1/explanations/{subject_type}/{subject_id}
  Returns a short Hebrew explanation of a bill or vote.  Generated once with
  Claude on the first request, then served from the DB on every later request.

This is a POST (not GET) because the first call has a side effect (generates +
persists) and a cost — we don't want it triggered by prefetch or crawlers.
The global slowapi default limit (100/min) applies, same as every other route.

The bill/vote context is fetched server-side from our own data (not the request
body), so a cached explanation can't be poisoned by a crafted request.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.deps import DbDep, SettingsDep
from app.services import ai_explanation_service as ai

router = APIRouter()

_VALID_TYPES = {"bill", "vote"}


class ExplanationResponse(BaseModel):
    subject_type: str
    subject_id: int
    content: str
    cached: bool
    model: str


@router.post("/{subject_type}/{subject_id}", response_model=ExplanationResponse)
async def explain(
    subject_type: str,
    subject_id: int,
    db: DbDep,
    settings: SettingsDep,
):
    if subject_type not in _VALID_TYPES:
        raise HTTPException(status_code=404, detail="unknown subject type")

    if not settings.ai_explanations_enabled:
        raise HTTPException(status_code=503, detail="AI explanations are not configured")

    try:
        content, cached, model = await ai.get_or_generate(db, subject_type, subject_id)
    except LookupError:
        raise HTTPException(status_code=404, detail="subject not found")
    except RuntimeError:
        raise HTTPException(status_code=502, detail="explanation generation failed")

    return ExplanationResponse(
        subject_type=subject_type,
        subject_id=subject_id,
        content=content,
        cached=cached,
        model=model,
    )
