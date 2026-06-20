import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '20');
  const search = searchParams.get('search');
  const faction_id = searchParams.get('faction_id') ? parseInt(searchParams.get('faction_id')!) : null;
  const is_current_str = searchParams.get('is_current');
  const is_current = is_current_str !== null ? is_current_str === 'true' : null;

  try {
    let query = supabase.from('members').select('*', { count: 'exact' });

    if (is_current !== null) {
      query = query.eq('is_current', is_current);
    }

    if (search) {
      query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,first_name_eng.ilike.%${search}%,last_name_eng.ilike.%${search}%`);
    }

    if (faction_id !== null) {
      const { data: mfs } = await supabase.from('member_factions').select('mk_individual_id').eq('faction_id', faction_id).is('finish_date', null);
      if (mfs && mfs.length > 0) {
        query = query.in('mk_individual_id', mfs.map(mf => mf.mk_individual_id));
      } else {
        query = query.in('mk_individual_id', [0]); // Hack to force 0 results
      }
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data: members, count, error } = await query
      .order('last_name', { ascending: true, nullsFirst: false })
      .order('first_name', { ascending: true, nullsFirst: false })
      .range(from, to);

    if (error) throw error;

    let mk_ids = (members || []).map(m => m.mk_individual_id);
    let factions_by_mk: Record<number, any[]> = {};
    
    if (mk_ids.length > 0) {
      const { data: all_factions } = await supabase.from('member_factions').select('*').in('mk_individual_id', mk_ids);
      if (all_factions) {
        for (const mf of all_factions) {
          if (!factions_by_mk[mf.mk_individual_id]) factions_by_mk[mf.mk_individual_id] = [];
          factions_by_mk[mf.mk_individual_id].push(mf);
        }
      }
    }

    const _memberToDict = (m: any, faction_rows: any[]) => {
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

      return {
        mk_individual_id: m.mk_individual_id,
        person_id: m.person_id,
        mk_individual_name: [m.first_name, m.last_name].filter(Boolean).join(' ').trim(),
        mk_individual_name_eng: [m.first_name_eng, m.last_name_eng].filter(Boolean).join(' ').trim(),
        mk_individual_first_name: m.first_name || "",
        mk_individual_first_name_eng: m.first_name_eng || "",
        mk_individual_photo: m.photo_url,
        mk_individual_email: m.email,
        mk_individual_phone: m.phone,
        gender_desc: m.gender_desc || "",
        is_current: m.is_current,
        is_coalition: m.is_coalition,
        knessets,
        current_faction,
        faction_history: hist,
        positions: [],
      };
    };

    const data = (members || []).map(m => _memberToDict(m, factions_by_mk[m.mk_individual_id] || []));

    const total = count || 0;
    const total_pages = Math.ceil(total / limit) || 1;

    return NextResponse.json({
      data,
      pagination: { page, limit, total, total_pages },
      cached_at: new Date().toISOString(),
      updating: false
    });
  } catch (error) {
    console.error("Members API error:", error);
    return NextResponse.json({ error: "Failed to fetch members" }, { status: 500 });
  }
}
