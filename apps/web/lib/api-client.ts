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
  MKProfile,
  MKStats,
  Faction,
  FactionCohesionData,
  DashboardStats,
  BillListParams,
  VoteListParams,
  MKListParams,
  PartyListParams,
} from "@knesset/types";

// ── Bills ─────────────────────────────────────────────────────────────────────
export const billsApi = {
  list: (params: BillListParams = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null && v !== "")
        .map(([k, v]) => [k, String(v)])
    ).toString();
    return apiFetch<PaginatedResponse<Bill>>(`/api/v1/bills${qs ? `?${qs}` : ""}`);
  },

  get: (billId: number) =>
    apiFetch<BillDetail>(`/api/v1/bills/${billId}`),

  getVotes: (billId: number) =>
    apiFetch<VoteDetail>(`/api/v1/bills/${billId}/votes`),
};

// ── Members ───────────────────────────────────────────────────────────────────
export const membersApi = {
  list: (params: MKListParams = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null && v !== "")
        .map(([k, v]) => [k, String(v)])
    ).toString();
    return apiFetch<PaginatedResponse<MKProfile>>(`/api/v1/members${qs ? `?${qs}` : ""}`);
  },

  get: (mkId: number) =>
    apiFetch<MKProfile>(`/api/v1/members/${mkId}`),

  getStats: (mkId: number) =>
    apiFetch<MKStats>(`/api/v1/members/${mkId}/stats`),

  getVotes: (mkId: number, page = 1, limit = 20) =>
    apiFetch<PaginatedResponse<VoteResult>>(
      `/api/v1/members/${mkId}/votes?page=${page}&limit=${limit}`
    ),
};

// ── Parties ───────────────────────────────────────────────────────────────────
export const partiesApi = {
  list: (params: PartyListParams = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null && v !== "")
        .map(([k, v]) => [k, String(v)])
    ).toString();
    return apiFetch<PaginatedResponse<Faction>>(`/api/v1/parties${qs ? `?${qs}` : ""}`);
  },

  get: (factionId: number) =>
    apiFetch<Faction>(`/api/v1/parties/${factionId}`),

  getCohesion: (factionId: number) =>
    apiFetch<FactionCohesionData>(`/api/v1/parties/${factionId}/cohesion`),
};

// ── Votes ─────────────────────────────────────────────────────────────────────
export const votesApi = {
  list: (params: VoteListParams = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null && v !== "")
        .map(([k, v]) => [k, String(v)])
    ).toString();
    return apiFetch<PaginatedResponse<VoteResult>>(`/api/v1/votes${qs ? `?${qs}` : ""}`);
  },

  get: (voteId: number) =>
    apiFetch<VoteDetail>(`/api/v1/votes/${voteId}`),
};

// ── Stats ─────────────────────────────────────────────────────────────────────
export const statsApi = {
  dashboard: () => apiFetch<DashboardStats>("/api/v1/stats/dashboard"),
};

export { ApiError };
