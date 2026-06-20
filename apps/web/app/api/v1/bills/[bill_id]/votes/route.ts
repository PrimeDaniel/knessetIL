import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getVoteDetail } from '@/lib/votes';

const KNESSET_V4_BASE = "https://knesset.gov.il/OdataV4/ParliamentInfo";

function extractBaseLawName(billName: string): string | null {
  if (!billName) return null;
  const match = billName.match(/^הצעת\s+חוק\s+([^(,]+)/);
  if (match) return match[1].trim();
  return billName.split('(')[0].split(',')[0].replace(/^הצעת\s+/, '').trim();
}

export async function GET(request: Request, { params }: { params: { bill_id: string } }) {
  const bill_id = parseInt(params.bill_id);

  try {
    let baseName = null;
    let knesset_num = 25;
    
    // 1. Fetch the original bill's name to find its base law
    try {
      const bRes = await fetch(`${KNESSET_V4_BASE}/KNS_Bill?$format=json&$filter=Id eq ${bill_id}`);
      if (bRes.ok) {
        const bJson = await bRes.json();
        if (bJson.value && bJson.value.length > 0) {
          baseName = extractBaseLawName(bJson.value[0].Name);
          knesset_num = parseInt(bJson.value[0].KnessetNum || '25');
        }
      }
    } catch(e){}

    if (!baseName) {
      const { data: b } = await supabase.from('bills').select('name, knesset_num').eq('bill_id', bill_id).single();
      if (b && b.name) {
        baseName = extractBaseLawName(b.name);
        knesset_num = b.knesset_num || 25;
      }
    }

    let relatedBillIds = [bill_id];

    // 2. Find all related bill IDs using the base name
    if (baseName && baseName.length > 3) {
      const { data: sBills } = await supabase.from('bills').select('bill_id').ilike('name', `%${baseName}%`);
      if (sBills) sBills.forEach(b => relatedBillIds.push(b.bill_id));

      if (knesset_num >= 25) {
        try {
          const escaped = baseName.replace(/'/g, "''");
          const rRes = await fetch(`${KNESSET_V4_BASE}/KNS_Bill?$format=json&$filter=contains(Name, '${escaped}')&$select=Id`);
          if (rRes.ok) {
            const rJson = await rRes.json();
            (rJson.value || []).forEach((b: any) => relatedBillIds.push(parseInt(b.Id)));
          }
        } catch(e){}
      }
    }

    relatedBillIds = Array.from(new Set(relatedBillIds));

    // 3. Find SessionItems for all these bills
    let itemIds = [...relatedBillIds];
    
    for (let i = 0; i < relatedBillIds.length; i += 20) {
      const chunk = relatedBillIds.slice(i, i + 20);
      const filter = chunk.map(id => `ItemID eq ${id}`).join(' or ');
      try {
        const sessRes = await fetch(`${KNESSET_V4_BASE}/KNS_PlmSessionItem?$format=json&$filter=${filter}`);
        if (sessRes.ok) {
          const sessJson = await sessRes.json();
          (sessJson.value || []).forEach((item: any) => {
             const iid = parseInt(item.ItemID || item.Id);
             if (iid) itemIds.push(iid);
          });
        }
      } catch(e){}
    }
    
    itemIds = Array.from(new Set(itemIds));
    if (itemIds.length === 0) {
      return NextResponse.json([]);
    }

    // 4. Find all votes for these SessionItems
    let voteIds: number[] = [];

    for (let i = 0; i < itemIds.length; i += 20) {
      const chunk = itemIds.slice(i, i + 20);
      const filter = chunk.map(id => `ItemID eq ${id}`).join(' or ');
      try {
        const vRes = await fetch(`${KNESSET_V4_BASE}/KNS_PlenumVote?$format=json&$filter=${filter}&$select=Id`);
        if (vRes.ok) {
          const vJson = await vRes.json();
          (vJson.value || []).forEach((v: any) => {
            const vid = parseInt(v.Id);
            if (vid) voteIds.push(vid);
          });
        }
      } catch(e){}
    }

    const { data: headers } = await supabase.from('vote_headers').select('vote_id').in('vote_item_id', itemIds);
    if (headers) {
      headers.forEach(h => voteIds.push(h.vote_id));
    }

    voteIds = Array.from(new Set(voteIds));

    if (voteIds.length === 0) {
      return NextResponse.json([]);
    }

    // 5. Fetch Vote Details
    voteIds.sort((a, b) => b - a);
    const targetVotes = voteIds.slice(0, 5); // Limit to latest 5 to prevent long load times

    const votePromises = targetVotes.map(vid => getVoteDetail(vid));
    let voteDetails = await Promise.all(votePromises);
    
    voteDetails = voteDetails.filter(v => v !== null);

    return NextResponse.json(voteDetails);

  } catch (error) {
    console.error("Bill Votes API error:", error);
    return NextResponse.json({ error: "Failed to fetch bill votes" }, { status: 500 });
  }
}
