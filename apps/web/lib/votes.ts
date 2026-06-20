import { supabase } from '@/lib/supabase';

const KNESSET_V4_BASE = "https://knesset.gov.il/OdataV4/ParliamentInfo";

const V4_RESULT_CODE_MAP: Record<number, string> = {
  7: "for",
  8: "against",
  9: "abstain",
  6: "absent",
};

export async function getVoteDetail(vote_id: number) {
  if (vote_id > 34525) { // OData threshold
    const odataUrl = `${KNESSET_V4_BASE}/KNS_PlenumVote?$format=json&$filter=Id eq ${vote_id}&$expand=VoteResults`;
    const res = await fetch(odataUrl, { next: { revalidate: 3600 } });
    if (!res.ok) return null;

    const json = await res.json();
    const rows = json.value || [];
    if (rows.length === 0) return null;

    const row = rows[0];

    let vote_date = "";
    let vote_time = null;
    if (row.VoteDateTime) {
      const parts = row.VoteDateTime.split("T");
      vote_date = parts[0];
      vote_time = parts.length > 1 ? parts[1].split("+")[0] : null;
    }

    const counts = { "for": 0, "against": 0, "abstain": 0, "absent": 0 };
    const results = row.VoteResults || [];

    const { data: mems } = await supabase.from('members').select('mk_individual_id, first_name, last_name, photo_url');
    const nameMap: Record<string, any> = {};
    if (mems) {
      for (const m of mems) {
        const key = `${(m.last_name||'').trim()}_${(m.first_name||'').trim()}`;
        nameMap[key] = m;
      }
    }

    const { data: facs } = await supabase.from('member_factions').select('mk_individual_id, faction_id, faction_name').is('finish_date', null);
    const mkFactionMap: Record<number, any> = {};
    if (facs) {
      for (const f of facs) mkFactionMap[f.mk_individual_id] = f;
    }

    const mk_votes = [];
    const factionAccum: Record<number, any> = {};

    for (const r of results) {
      const decision = V4_RESULT_CODE_MAP[r.ResultCode || 0] || "absent";
      counts[decision as keyof typeof counts]++;

      const last = (r.LastName || "").trim();
      const first = (r.FirstName || "").trim();
      const key = `${last}_${first}`;
      const minfo = nameMap[key] || {};
      const mkId = minfo.mk_individual_id || 0;
      const factionInfo = mkFactionMap[mkId] || {};

      mk_votes.push({
        vote_id,
        mk_individual_id: mkId,
        mk_name: `${last} ${first}`.trim(),
        mk_name_eng: "",
        mk_individual_photo: minfo.photo_url || null,
        faction_id: factionInfo.faction_id || null,
        faction_name: factionInfo.faction_name || null,
        decision,
        vote_date,
        vote_item_dscr: (row.VoteTitle || row.VoteSubject || "").trim()
      });

      const fid = factionInfo.faction_id || 0;
      if (!factionAccum[fid]) {
        factionAccum[fid] = {
          faction_id: fid,
          faction_name: factionInfo.faction_name || "",
          for_count: 0, against_count: 0, abstain_count: 0, absent_count: 0, total_members: 0
        };
      }
      factionAccum[fid].total_members++;
      factionAccum[fid][`${decision}_count`]++;
    }

    const party_breakdown = Object.values(factionAccum).sort((a: any, b: any) => (b.for_count + b.against_count + b.abstain_count) - (a.for_count + a.against_count + a.abstain_count));

    return {
      id: vote_id,
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
      mk_votes,
      party_breakdown
    };

  } else {
    // Postgres Fallback
    const { data: header, error } = await supabase.from('vote_headers').select('*').eq('vote_id', vote_id).single();
    if (error || !header) return null;

    const { data: decisions } = await supabase.from('vote_decisions').select('*').eq('vote_id', vote_id);
    
    const mk_votes = (decisions || []).map(d => ({
      vote_id,
      mk_individual_id: d.member_id,
      mk_name: d.member_name || "",
      mk_name_eng: "",
      mk_individual_photo: null,
      faction_id: d.faction_id,
      faction_name: d.faction_name || "",
      decision: d.result,
      vote_date: header.vote_date,
      vote_item_dscr: header.vote_item_dscr
    }));

    const factionAccum: Record<number, any> = {};
    for (const mv of mk_votes) {
      const fid = mv.faction_id || 0;
      if (!factionAccum[fid]) {
        factionAccum[fid] = {
          faction_id: fid,
          faction_name: mv.faction_name || "",
          for_count: 0, against_count: 0, abstain_count: 0, absent_count: 0, total_members: 0
        };
      }
      factionAccum[fid].total_members++;
      factionAccum[fid][`${mv.decision}_count`]++;
    }

    const party_breakdown = Object.values(factionAccum).sort((a: any, b: any) => (b.for_count + b.against_count + b.abstain_count) - (a.for_count + a.against_count + a.abstain_count));

    return {
      id: header.vote_id,
      knesset_num: header.knesset_num,
      session_id: header.session_id,
      vote_date: header.vote_date || "",
      vote_time: header.vote_time || null,
      vote_item_id: header.vote_item_id,
      vote_item_dscr: header.vote_item_dscr || "",
      sess_item_dscr: header.sess_item_dscr || "",
      vote_type: header.vote_type || 0,
      is_accepted: Boolean(header.is_accepted),
      total_for: header.total_for,
      total_against: header.total_against,
      total_abstain: header.total_abstain,
      total_absent: 0,
      mk_votes,
      party_breakdown
    };
  }
}
