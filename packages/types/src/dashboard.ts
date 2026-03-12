// ============================================================
// Dashboard / stats types (homepage)
// ============================================================

export interface DashboardStats {
  knesset_num: number;
  // Vote counts
  total_votes_this_knesset: number;
  total_votes_accepted: number;
  total_votes_rejected: number;
  // Bills
  total_bills: number;
  bills_passed: number;
  // MKs
  total_active_mks: number;
  total_factions: number;
  // Recent activity
  recent_votes: RecentVote[];
  recent_bills: RecentBill[];
  // Monthly vote trend for chart (last 12 months)
  vote_trend: Array<{ date: string; accepted: number; rejected: number }>;
  // Top stats
  most_rebellious_mks: Array<{
    mk_individual_id: number;
    mk_individual_name: string;
    rebellion_rate: number;
    faction_name: string | null;
  }>;
  cached_at: string;
}

export interface RecentVote {
  vote_id: number;
  vote_date: string;
  vote_item_dscr: string; // Hebrew
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
