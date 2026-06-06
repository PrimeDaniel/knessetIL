/**
 * Typed fetch wrapper for the KnessetIL FastAPI backend.
 * All requests go through this module — centralises base URL, error handling,
 * and response typing.
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function buildQueryString(params: object): string {
  const qs = new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .map(([k, v]) => [k, String(v)])
  ).toString();
  return qs ? `?${qs}` : "";
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, text);
  }

  return res.json() as Promise<T>;
}

// ── Type imports ──────────────────────────────────────────────────────────────
import type {
  PaginatedResponse,
  Bill,
  BillDetail,
  VoteResult,
  VoteDetail,
  MKVoteHistoryItem,
  MKProfile,
  MKStats,
  Faction,
  FactionDetail,
  FactionCohesionData,
  DashboardStats,
  BillListParams,
  VoteListParams,
  MKListParams,
  PartyListParams,
  ExplanationResponse,
  ExplanationSubjectType,
} from "@knesset/types";

// ── Bills ─────────────────────────────────────────────────────────────────────
export const billsApi = {
  list: (params: BillListParams = {}) =>
    apiFetch<PaginatedResponse<Bill>>(`/api/v1/bills${buildQueryString(params)}`),

  get: (billId: number) =>
    apiFetch<BillDetail>(`/api/v1/bills/${billId}`),

  getVotes: (billId: number) =>
    apiFetch<VoteDetail>(`/api/v1/bills/${billId}/votes`),
};

// ── Members ───────────────────────────────────────────────────────────────────
export const membersApi = {
  list: (params: MKListParams = {}) =>
    apiFetch<PaginatedResponse<MKProfile>>(`/api/v1/members${buildQueryString(params)}`),

  get: (mkId: number) =>
    apiFetch<MKProfile>(`/api/v1/members/${mkId}`),

  getStats: (mkId: number) =>
    apiFetch<MKStats>(`/api/v1/members/${mkId}/stats`),

  getVotes: (mkId: number, page = 1, limit = 20) =>
    apiFetch<PaginatedResponse<MKVoteHistoryItem>>(
      `/api/v1/members/${mkId}/votes?page=${page}&limit=${limit}`
    ),
};

// ── Parties ───────────────────────────────────────────────────────────────────
export const partiesApi = {
  list: (params: PartyListParams = {}) =>
    apiFetch<PaginatedResponse<Faction>>(`/api/v1/parties${buildQueryString(params)}`),

  get: (factionId: number) =>
    apiFetch<FactionDetail>(`/api/v1/parties/${factionId}`),

  getCohesion: (factionId: number) =>
    apiFetch<FactionCohesionData>(`/api/v1/parties/${factionId}/cohesion`),
};

// ── Votes ─────────────────────────────────────────────────────────────────────
export const votesApi = {
  list: (params: VoteListParams = {}) =>
    apiFetch<PaginatedResponse<VoteResult>>(`/api/v1/votes${buildQueryString(params)}`),

  get: (voteId: number) =>
    apiFetch<VoteDetail>(`/api/v1/votes/${voteId}`),
};

// ── Stats ─────────────────────────────────────────────────────────────────────
export const statsApi = {
  dashboard: () => apiFetch<DashboardStats>("/api/v1/stats/dashboard"),
};

// ── AI explanations ─────────────────────────────────────────────────────────────
export const explanationsApi = {
  explain: (type: ExplanationSubjectType, id: number) =>
    apiFetch<ExplanationResponse>(`/api/v1/explanations/${type}/${id}`, {
      method: "POST",
    }),
};

export { ApiError };
