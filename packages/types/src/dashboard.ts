// ============================================================
// Dashboard / stats types (homepage)
// ============================================================

export interface DashboardStats {
  knesset_num: number;
  total_votes_this_knesset: number;
  total_bills: number;
  total_active_mks: number;
  bills_passed_into_law: number;
  recent_votes: RecentVote[];
  recent_bills: RecentBill[];
  cached_at: string;
  /** True when the cached data is stale and being refreshed in the background. */
  updating?: boolean;
}

export interface RecentVote {
  vote_id: number;
  vote_date: string;
  vote_item_dscr: string; // Hebrew — specific vote item (e.g. הסתייגות)
  sess_item_dscr: string; // Hebrew — broader session/topic context (bill name etc.)
  vote_type: number;
  session_num: number;
  is_accepted: boolean;
  total_for: number;
  total_against: number;
  total_abstain: number;
}

export interface RecentBill {
  bill_id: number;
  name: string; // Hebrew
  status_desc: string;
  publication_date: string | null;
  initiator_name: string | null;
}
