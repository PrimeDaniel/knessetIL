// ============================================================
// Member of Knesset (MK) types
// Mirrors: mk_individual.csv (1,166 records) + 9 related CSV sources
// ============================================================

export type Gender = "זכר" | "נקבה" | string;

export interface FactionRef {
  id: number;
  name: string;
  knesset_num: number;
}

export interface FactionMembership {
  faction_id: number;
  faction_name: string;
  start_date: string;
  finish_date: string | null;
  knesset_num: number;
}

export interface Position {
  position_id: number;
  position_name: string; // Hebrew
  body_name: string | null;
  start_date: string | null;
  finish_date: string | null;
}

export interface MKProfile {
  mk_individual_id: number;
  mk_individual_name: string;           // Full Hebrew name (last + first)
  mk_individual_name_eng: string;       // Full English name
  mk_individual_first_name: string;     // Hebrew first name
  mk_individual_first_name_eng: string;
  mk_individual_photo: string | null;   // URL to photo
  mk_individual_email: string | null;
  mk_individual_phone: string | null;
  gender_desc: Gender;
  is_current: boolean;
  knessets: number[];                   // Knesset sessions served in
  current_faction: FactionRef | null;
  faction_history: FactionMembership[];
  positions: Position[];
}

// Pre-computed stats for an MK (cached 12h)
// NOTE: rebellion_rate and attendance_rate are null — per-MK vote decisions
// are not available in the public oknesset CSV data (only aggregate totals exist).
export interface MKStats {
  mk_individual_id: number;
  total_votes: number;
  votes_for: number;
  votes_against: number;
  votes_abstain: number;
  votes_absent: number;
  rebellion_rate: number | null;
  attendance_rate: number | null;
  bills_proposed: number;
  current_term_votes: number;
  current_term_rebellion_rate: number | null;
}

export interface MKListParams {
  page?: number;
  limit?: number;
  search?: string;       // Hebrew or English name
  faction_id?: number;
  knesset_num?: number;
  is_current?: boolean;
  gender?: string;
}
