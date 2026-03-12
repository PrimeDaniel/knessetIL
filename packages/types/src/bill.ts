// ============================================================
// Bill-related types
// Mirrors: kns_bill.csv (60,088 rows, PascalCase source) + kns_billinitiator.csv
// Schema verified from oknesset datapackage.json 2026-03-12
// ============================================================

export type BillStatus =
  | "הוגש"         // Filed
  | "בוועדה"       // In Committee
  | "עבר/ה"        // Passed
  | "נדחה/ה"       // Rejected
  | "פג תוקף"      // Expired
  | string;         // catch-all for other statuses

export interface BillInitiator {
  mk_individual_id: number;
  mk_name: string; // Hebrew
  mk_name_eng: string;
  faction_name: string | null;
}

export interface Bill {
  bill_id: number;
  knesset_num: number;
  name: string;          // Hebrew title
  name_eng: string | null;
  status_id: number;
  status_desc: BillStatus;
  sub_type_id: number | null;
  sub_type_desc: string | null;
  union_type_id: number | null;
  publication_date: string | null; // ISO date
  publication_num: number | null;
  summary_law: string | null;      // Hebrew summary text
  is_continuation: boolean;
  initiators: BillInitiator[];
}

export interface BillDetail extends Bill {
  // Vote result associated with this bill (if any)
  vote?: {
    vote_id: number;
    vote_date: string;
    is_accepted: boolean;
    total_for: number;
    total_against: number;
    total_abstain: number;
  };
  related_bills: Array<{ bill_id: number; name: string }>;
}

export interface BillListParams {
  page?: number;
  limit?: number;
  search?: string;       // Full-text search on Hebrew name
  status_id?: number;
  knesset_num?: number;
  initiator_id?: number; // Filter by MK who proposed the bill
  date_from?: string;    // publication_date from
  date_to?: string;      // publication_date to
}
