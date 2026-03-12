// ============================================================
// Shared API envelope types (used by all list endpoints)
// ============================================================

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: Pagination;
  cached_at: string; // ISO timestamp
}

export interface ApiError {
  detail: string;
  status_code: number;
}

// Query params shared across list endpoints
export interface ListParams {
  page?: number;
  limit?: number;
  search?: string;
}
