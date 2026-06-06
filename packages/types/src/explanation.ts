// ============================================================
// AI explanation contract (web ↔ api)
// Mirrors apps/api/app/routers/explanations.py
// ============================================================

export type ExplanationSubjectType = "bill" | "vote";

export interface ExplanationResponse {
  subject_type: ExplanationSubjectType;
  subject_id: number;
  content: string;
  /** True when served from the DB (no model call was made). */
  cached: boolean;
  model: string;
}
