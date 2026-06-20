import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: Request, { params }: { params: { faction_id: string } }) {
  const faction_id = parseInt(params.faction_id);

  try {
    const { data: faction, error } = await supabase.from('factions').select('name').eq('id', faction_id).single();
    if (error || !faction) throw new Error("Faction not found");

    const { data: decisions, error: decError } = await supabase
      .from('vote_decisions')
      .select('vote_id, result')
      .eq('faction_id', faction_id);

    if (decError) throw decError;

    if (!decisions || decisions.length === 0) {
      return NextResponse.json({
        faction_id,
        faction_name: faction.name,
        cohesion_score: null,
        total_votes_analyzed: 0,
        recent_cohesion: [],
      });
    }

    const voteResults: Record<number, Set<string>> = {};
    for (const d of decisions) {
      if (d.result !== "absent") {
        if (!voteResults[d.vote_id]) voteResults[d.vote_id] = new Set();
        voteResults[d.vote_id].add(d.result);
      }
    }

    const total_votes = Object.keys(voteResults).length;
    let cohesive = 0;
    
    if (total_votes > 0) {
      for (const results of Object.values(voteResults)) {
        if (results.size === 1) {
          cohesive++;
        }
      }
    }

    const cohesion_score = total_votes === 0 ? null : Number((cohesive / total_votes).toFixed(4));

    return NextResponse.json({
      faction_id,
      faction_name: faction.name,
      cohesion_score,
      total_votes_analyzed: total_votes,
      recent_cohesion: [],
    });

  } catch (error) {
    console.error("Party Cohesion API error:", error);
    return NextResponse.json({ error: "Failed to fetch party cohesion" }, { status: 404 });
  }
}
