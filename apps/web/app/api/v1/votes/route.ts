import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const KNESSET_V4_BASE = "https://knesset.gov.il/OdataV4/ParliamentInfo";

const V4_RESULT_CODE_MAP: Record<number, string> = {
  7: "for",
  8: "against",
  9: "abstain",
  6: "absent",
};

function parseV4Vote(row: any) {
  let vote_date = "";
  let vote_time = null;
  if (row.VoteDateTime) {
    const parts = row.VoteDateTime.split("T");
    vote_date = parts[0];
    vote_time = parts.length > 1 ? parts[1].split("+")[0] : null;
  }

  const counts = { "for": 0, "against": 0, "abstain": 0, "absent": 0 };
  if (row.VoteResults && Array.isArray(row.VoteResults)) {
    for (const r of row.VoteResults) {
      const decision = V4_RESULT_CODE_MAP[r.ResultCode || 0] || "absent";
      counts[decision as keyof typeof counts]++;
    }
  }

  return {
    id: parseInt(row.Id || '0'),
    knesset_num: 25,
    session_id: parseInt(row.SessionID || '0'),
    vote_date,
    vote_time,
    vote_item_id: parseInt(row.ItemID || '0'),
    vote_item_dscr: (row.VoteTitle || row.VoteSubject || "").trim(),
    sess_item_dscr: (row.VoteSubject || "").trim(),
    vote_type: 0,
    is_accepted: counts["for"] > counts["against"],
    total_for: counts["for"],
    total_against: counts["against"],
    total_abstain: counts["abstain"],
    total_absent: counts["absent"],
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '20');
  const knesset_num = searchParams.get('knesset_num') ? parseInt(searchParams.get('knesset_num')!) : 25;
  const is_accepted_str = searchParams.get('is_accepted');
  const is_accepted = is_accepted_str !== null ? is_accepted_str === 'true' : null;
  const date_from = searchParams.get('date_from');
  const date_to = searchParams.get('date_to');

  try {
    if (knesset_num >= 25) {
      const skip = (page - 1) * limit;
      let odataUrl = `${KNESSET_V4_BASE}/KNS_PlenumVote?$format=json&$top=${limit}&$skip=${skip}&$count=true&$orderby=VoteDateTime desc&$expand=VoteResults`;
      
      const filters = [];
      if (date_from) filters.push(`VoteDateTime ge ${date_from}T00:00:00`);
      if (date_to) filters.push(`VoteDateTime le ${date_to}T23:59:59`);
      if (filters.length > 0) odataUrl += `&$filter=${encodeURIComponent(filters.join(' and '))}`;

      const res = await fetch(odataUrl, { next: { revalidate: 300 } }); // 5 min cache
      if (!res.ok) throw new Error("Failed to fetch OData");

      const json = await res.json();
      let votes = (json.value || []).map(parseV4Vote);
      const total = parseInt(json["@odata.count"] || '0');

      if (is_accepted !== null) {
        votes = votes.filter((v: any) => v.is_accepted === is_accepted);
      }

      const total_pages = Math.ceil(total / limit) || 1;

      return NextResponse.json({
        data: votes,
        pagination: { page, limit, total, total_pages },
        cached_at: new Date().toISOString(),
        updating: false
      });
    } else {
      let query = supabase.from('vote_headers').select('*', { count: 'exact' });
      query = query.eq('knesset_num', knesset_num);
      
      if (date_from) query = query.gte('vote_date', date_from);
      if (date_to) query = query.lte('vote_date', date_to);
      if (is_accepted !== null) query = query.eq('is_accepted', is_accepted);

      const from = (page - 1) * limit;
      const to = from + limit - 1;

      const { data: votes, count, error } = await query
        .order('vote_date', { ascending: false, nullsFirst: false })
        .range(from, to);
      
      if (error) throw error;

      const data = (votes || []).map(v => ({
        id: v.vote_id,
        knesset_num: v.knesset_num,
        session_id: v.session_id,
        vote_date: v.vote_date || "",
        vote_time: v.vote_time || null,
        vote_item_id: v.vote_item_id,
        vote_item_dscr: v.vote_item_dscr || "",
        sess_item_dscr: v.sess_item_dscr || "",
        vote_type: v.vote_type || 0,
        is_accepted: Boolean(v.is_accepted),
        total_for: v.total_for,
        total_against: v.total_against,
        total_abstain: v.total_abstain,
        total_absent: 0,
      }));

      const total = count || 0;
      const total_pages = Math.ceil(total / limit) || 1;

      return NextResponse.json({
        data,
        pagination: { page, limit, total, total_pages },
        cached_at: new Date().toISOString(),
        updating: false
      });
    }
  } catch (error) {
    console.error("Votes API error:", error);
    return NextResponse.json({ error: "Failed to fetch votes" }, { status: 500 });
  }
}
