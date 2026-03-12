// ============================================================
// Vote-related types
// Mirrors: view_vote_rslts_hdr_approved.csv + view_vote_mk_individual.csv
// ============================================================

export type VoteDecision = "for" | "against" | "abstain" | "absent";

export interface VoteResult {
  id: number;
  knesset_num: number;
  session_id: number;
  vote_date: string; // ISO date string (YYYY-MM-DD)
  vote_time: string | null;
  vote_item_id: number;
  vote_item_dscr: string; // Hebrew description of what was voted on
  vote_type: string | null;
  is_accepted: boolean;
  total_for: number;
  total_against: number;
  total_abstain: number;
  total_absent: number;
}

// Single MK's vote on a specific vote item
export interface MKVoteRecord {
  vote_id: number;
  mk_individual_id: number;
  mk_name: string; // Hebrew
  mk_name_eng: string;
  faction_id: number | null;
  faction_name: string | null;
  decision: VoteDecision;
  vote_date: string;
  vote_item_dscr: string;
}

// Vote breakdown per party (for charts)
export interface PartyVoteBreakdown {
  faction_id: number;
  faction_name: string;
  for_count: number;
  against_count: number;
  abstain_count: number;
  absent_count: number;
  total_members: number;
}

// Aggregated vote detail for a bill's vote
export interface VoteDetail extends VoteResult {
  party_breakdown: PartyVoteBreakdown[];
  mk_votes: MKVoteRecord[];
}

export interface VoteListParams {
  page?: number;
  limit?: number;
  knesset_num?: number;
  date_from?: string; // YYYY-MM-DD
  date_to?: string;   // YYYY-MM-DD
  faction_id?: number;
  is_accepted?: boolean;
}
