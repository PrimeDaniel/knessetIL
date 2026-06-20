import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: Request, { params }: { params: { faction_id: string } }) {
  const faction_id = parseInt(params.faction_id);

  try {
    const { data: faction, error } = await supabase.from('factions').select('*').eq('id', faction_id).single();
    if (error || !faction) throw new Error("Faction not found");

    // Current members
    const { data: mfs } = await supabase.from('member_factions').select('mk_individual_id, faction_id').eq('faction_id', faction_id).is('finish_date', null);
    
    let members: any[] = [];
    if (mfs && mfs.length > 0) {
      const mkIds = mfs.map(mf => mf.mk_individual_id);
      const { data: mems } = await supabase.from('members').select('*').in('mk_individual_id', mkIds).is('is_current', true);
      
      if (mems) {
        members = mems.map(m => ({
          mk_individual_id: m.mk_individual_id,
          mk_individual_name: [m.first_name, m.last_name].filter(Boolean).join(' ').trim(),
          is_current: m.is_current,
          rebellion_rate: null,
        })).sort((a, b) => a.mk_individual_name.localeCompare(b.mk_individual_name, 'he'));
      }
    }

    const data = {
      id: faction.id,
      name: faction.name,
      start_date: faction.start_date || "",
      finish_date: faction.finish_date || null,
      knessets: faction.knessets || [],
      member_count: members.length,
      cohesion_score: null,
      members,
    };

    return NextResponse.json(data);
  } catch (error) {
    console.error("Party Detail API error:", error);
    return NextResponse.json({ error: "Failed to fetch party" }, { status: 404 });
  }
}
