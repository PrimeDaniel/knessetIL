import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: Request, { params }: { params: { mk_id: string } }) {
  const mk_id = parseInt(params.mk_id);

  try {
    const { data: member, error } = await supabase.from('members').select('*').eq('mk_individual_id', mk_id).single();
    if (error || !member) throw new Error("MK not found");

    const { data: factions } = await supabase.from('member_factions').select('*').eq('mk_individual_id', mk_id);
    const faction_rows = factions || [];

    let hist = faction_rows.map(mf => ({
      faction_id: mf.faction_id,
      faction_name: mf.faction_name || "",
      start_date: mf.start_date || "",
      finish_date: mf.finish_date || null,
      knesset_num: mf.knesset_num || 0,
    })).sort((a, b) => a.start_date.localeCompare(b.start_date));

    let current_faction = null;
    let active = hist.filter(h => h.finish_date === null);
    if (active.length > 0) {
      let latest = active[0];
      for (let i = 1; i < active.length; i++) {
        if (active[i].start_date > latest.start_date) latest = active[i];
      }
      current_faction = {
        id: latest.faction_id,
        name: latest.faction_name,
        knesset_num: latest.knesset_num,
      };
    }

    let knessets = Array.from(new Set(hist.map(h => h.knesset_num).filter(k => k))).sort((a, b) => a - b);

    const data = {
      mk_individual_id: member.mk_individual_id,
      person_id: member.person_id,
      mk_individual_name: [member.first_name, member.last_name].filter(Boolean).join(' ').trim(),
      mk_individual_name_eng: [member.first_name_eng, member.last_name_eng].filter(Boolean).join(' ').trim(),
      mk_individual_first_name: member.first_name || "",
      mk_individual_first_name_eng: member.first_name_eng || "",
      mk_individual_photo: member.photo_url,
      mk_individual_email: member.email,
      mk_individual_phone: member.phone,
      gender_desc: member.gender_desc || "",
      is_current: member.is_current,
      is_coalition: member.is_coalition,
      knessets,
      current_faction,
      faction_history: hist,
      positions: [],
    };

    return NextResponse.json(data);
  } catch (error) {
    console.error("Member Detail API error:", error);
    return NextResponse.json({ error: "Failed to fetch member" }, { status: 404 });
  }
}
