// ============================================================
// Party / Faction types
// Mirrors: factions.csv + mk_individual_factions.csv
// ============================================================

export interface Faction {
  id: number;
  name: string;          // Hebrew party name
  start_date: string;    // ISO date
  finish_date: string | null;
  knessets: number[];    // Knesset session numbers this faction existed in
  member_count: number;  // Current active members
  // Pre-computed metric (cached 12h):
  // Average % of votes where members voted with faction majority
  cohesion_score: number | null; // 0–1 float, null if insufficient data
}

export interface FactionDetail extends Faction {
  members: Array<{
    mk_individual_id: number;
    mk_individual_name: string;
    is_current: boolean;
    rebellion_rate: number;
  }>;
}

// Vote cohesion breakdown for chart rendering
export interface FactionCohesionData {
  faction_id: number;
  faction_name: string;
  cohesion_score: number;        // 0–1
  total_votes_analyzed: number;
  // Recent vote items for timeline chart
  recent_cohesion: Array<{
    vote_date: string;
    cohesion: number;
    vote_item_dscr: string;
  }>;
}

export interface PartyListParams {
  knesset_num?: number;
  is_active?: boolean; // has finish_date = null
}
