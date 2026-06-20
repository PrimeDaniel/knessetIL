import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const knesset_num = searchParams.get('knesset_num') ? parseInt(searchParams.get('knesset_num')!) : null;
  const is_active_str = searchParams.get('is_active');
  const is_active = is_active_str !== null ? is_active_str === 'true' : null;

  try {
    let query = supabase.from('factions').select('*');

    if (is_active === true) {
      query = query.is('finish_date', null);
    } else if (is_active === false) {
      query = query.not('finish_date', 'is', null);
    }

    if (knesset_num !== null) {
      query = query.contains('knessets', [knesset_num]);
    }

    const { data: factions, error } = await query;
    if (error) throw error;

    // We do a manual join approach in case PostgREST foreign key names differ
    const { data: mfs } = await supabase.from('member_factions').select('mk_individual_id, faction_id').is('finish_date', null);
    const { data: mems } = await supabase.from('members').select('mk_individual_id, is_current').eq('is_current', true);
    
    let memberCounts: Record<number, number> = {};
    if (mfs && mems) {
      const activeMkIds = new Set(mems.map(m => m.mk_individual_id));
      for (const mf of mfs) {
        if (activeMkIds.has(mf.mk_individual_id)) {
          memberCounts[mf.faction_id] = (memberCounts[mf.faction_id] || 0) + 1;
        }
      }
    }

    const data = (factions || []).map(f => ({
      id: f.id,
      name: f.name,
      start_date: f.start_date || "",
      finish_date: f.finish_date || null,
      knessets: f.knessets || [],
      member_count: memberCounts[f.id] || 0,
      cohesion_score: null,
    })).sort((a, b) => a.name.localeCompare(b.name, 'he'));

    return NextResponse.json({
      data,
      pagination: { page: 1, limit: data.length, total: data.length, total_pages: 1 },
      cached_at: new Date().toISOString(),
      updating: false
    });
  } catch (error) {
    console.error("Parties API error:", error);
    return NextResponse.json({ error: "Failed to fetch parties" }, { status: 500 });
  }
}
