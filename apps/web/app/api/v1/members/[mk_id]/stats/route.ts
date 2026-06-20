import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const KNESSET_V4_BASE = "https://knesset.gov.il/OdataV4/ParliamentInfo";

const V4_RESULT_CODE_MAP: Record<number, string> = {
  7: "for",
  8: "against",
  9: "abstain",
  6: "absent",
};

export async function GET(request: Request, { params }: { params: { mk_id: string } }) {
  const mk_id = parseInt(params.mk_id);

  try {
    const { data: member, error } = await supabase.from('members').select('person_id, is_current').eq('mk_individual_id', mk_id).single();
    if (error || !member) throw new Error("MK not found");

    const base = {
      mk_individual_id: mk_id,
      total_votes: 0,
      votes_for: 0,
      votes_against: 0,
      votes_abstain: 0,
      votes_absent: 0,
      rebellion_rate: null,
      attendance_rate: null,
      bills_proposed: 0,
      current_term_votes: 0,
      current_term_rebellion_rate: null,
    };

    if (!member.is_current || !member.person_id) {
      return NextResponse.json(base);
    }

    const odataUrl = `${KNESSET_V4_BASE}/KNS_PlenumVoteResult?$filter=MkId eq ${member.person_id}&$format=json`;
    const res = await fetch(odataUrl, { next: { revalidate: 3600 } });
    if (!res.ok) throw new Error("Failed to fetch OData");

    const json = await res.json();
    const rows = json.value || [];

    const counts = { "for": 0, "against": 0, "abstain": 0, "absent": 0 };
    for (const row of rows) {
      const decision = V4_RESULT_CODE_MAP[row.ResultCode || 6] || "absent";
      counts[decision as keyof typeof counts]++;
    }

    const total = counts["for"] + counts["against"] + counts["abstain"] + counts["absent"];
    const present = counts["for"] + counts["against"] + counts["abstain"];

    return NextResponse.json({
      ...base,
      total_votes: total,
      votes_for: counts["for"],
      votes_against: counts["against"],
      votes_abstain: counts["abstain"],
      votes_absent: counts["absent"],
      attendance_rate: total > 0 ? Number((present / total).toFixed(4)) : null,
      current_term_votes: total,
    });
  } catch (error) {
    console.error("Member Stats API error:", error);
    return NextResponse.json({ error: "Failed to fetch member stats" }, { status: 500 });
  }
}
