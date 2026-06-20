import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const KNESSET_V4_BASE = "https://knesset.gov.il/OdataV4/ParliamentInfo";

const STATUS_MAP: Record<number, string> = {
  1: "הונח על שולחן הכנסת",
  2: "בהכנה להצבעה",
  3: "עלה לדיון מוקדם",
  4: "עבר/ה בקריאה ראשונה",
  5: "בוועדה",
  6: "עבר/ה בקריאה שנייה ושלישית",
  7: "נדחה/ה",
  8: "נסוג/ה",
  9: "פג תוקף",
  10: "פוצל",
  11: "אוחד",
  12: "שונה שם",
  13: "הפך לחוק",
};

const V4_TO_CANONICAL_STATUS: Record<number, number> = {
  118: 13, 141: 4, 111: 4, 106: 4, 109: 4, 167: 4, 101: 5, 108: 5, 113: 5, 115: 5, 130: 5, 131: 5, 142: 5, 178: 5, 179: 5, 104: 3, 150: 3, 181: 3, 114: 2, 117: 2, 110: 7, 120: 7, 140: 7, 143: 7, 176: 7, 177: 7, 122: 11, 126: 11, 169: 11, 124: 12,
};

const CANONICAL_TO_V4_STATUS: Record<number, number[]> = {
  2: [101, 108, 114, 117],
  3: [104, 150, 181],
  4: [106, 109, 111, 141, 167],
  5: [101, 108, 113, 115, 130, 131, 142, 178, 179],
  6: [118],
  7: [110, 120, 140, 143, 176, 177],
  11: [122, 126, 169],
  12: [124],
  13: [118],
};

function parseV4Bill(row: any) {
  const raw_status_id = parseInt(row.StatusID || '0');
  const canonical_status_id = V4_TO_CANONICAL_STATUS[raw_status_id] || raw_status_id;
  const status_desc = STATUS_MAP[canonical_status_id] || `סטטוס ${raw_status_id}`;
  
  let pub_date = row.PublicationDate || row.LastUpdatedDate;
  if (pub_date) pub_date = pub_date.substring(0, 10);

  const initiators = [];
  if (row.KNS_BillInitiator && Array.isArray(row.KNS_BillInitiator)) {
    for (const init of row.KNS_BillInitiator) {
      if (init.IsInitiator === false) continue;
      const person = init.KNS_Person || {};
      const last = (person.LastName || "").trim();
      const first = (person.FirstName || "").trim();
      const mk_name = [first, last].filter(Boolean).join(' ') || `PersonID:${init.PersonID}`;
      initiators.push({
        mk_individual_id: parseInt(person.Id || '0'),
        mk_name,
        mk_name_eng: "",
        faction_name: null
      });
    }
  }

  return {
    bill_id: parseInt(row.BillID || row.Id || '0'),
    knesset_num: parseInt(row.KnessetNum || '0'),
    name: (row.Name || "").trim(),
    name_eng: null,
    status_id: canonical_status_id,
    status_desc,
    sub_type_id: row.SubTypeID !== null ? parseInt(row.SubTypeID) : null,
    sub_type_desc: row.SubTypeDesc,
    union_type_id: null,
    publication_date: pub_date,
    publication_num: row.PrivateNumber !== null ? parseInt(row.PrivateNumber) : null,
    summary_law: row.SummaryLaw,
    is_continuation: Boolean(row.IsContinuationBill),
    initiators
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '20');
  const knesset_num = searchParams.get('knesset_num') ? parseInt(searchParams.get('knesset_num')!) : 25;
  const search = searchParams.get('search');
  const status_id = searchParams.get('status_id') ? parseInt(searchParams.get('status_id')!) : null;
  const date_from = searchParams.get('date_from');
  const date_to = searchParams.get('date_to');
  const has_votes = searchParams.get('has_votes') === 'true';

  try {
    if (knesset_num >= 25) {
      // OData V4 Path
      const skip = (page - 1) * limit;
      let odataUrl = `${KNESSET_V4_BASE}/KNS_Bill?$format=json&$top=${limit}&$skip=${skip}&$count=true&$orderby=Id desc&$expand=KNS_BillInitiator($expand=KNS_Person)`;
      
      const filters = [`KnessetNum eq ${knesset_num}`];
      
      if (status_id !== null) {
        const v4_status_ids = CANONICAL_TO_V4_STATUS[status_id] || [status_id];
        if (v4_status_ids.length === 1) {
          filters.push(`StatusID eq ${v4_status_ids[0]}`);
        } else {
          filters.push(`StatusID in (${v4_status_ids.join(',')})`);
        }
      } else if (has_votes) {
        // If has_votes is true and no specific status is requested, we only want bills that advanced past 'Filed'.
        // We include all StatusIDs that map to advanced canonical statuses (2, 3, 4, 5, 6, 13)
        const advancedCanonical = [2, 3, 4, 5, 6, 13];
        const advancedV4Ids = advancedCanonical.flatMap(c => CANONICAL_TO_V4_STATUS[c] || []);
        if (advancedV4Ids.length > 0) {
          filters.push(`StatusID in (${advancedV4Ids.join(',')})`);
        }
      }

      if (search) {
        const escaped = search.replace(/'/g, "''");
        filters.push(`contains(Name, '${escaped}')`);
      }

      if (date_from) filters.push(`PublicationDate ge ${date_from}T00:00:00`);
      if (date_to) filters.push(`PublicationDate le ${date_to}T23:59:59`);

      if (filters.length > 0) {
        odataUrl += `&$filter=${encodeURIComponent(filters.join(' and '))}`;
      }

      const res = await fetch(odataUrl, { next: { revalidate: 3600 } });
      if (!res.ok) throw new Error("Failed to fetch OData");

      const json = await res.json();
      const rows = json.value || [];
      const total = parseInt(json["@odata.count"] || '0');
      
      const data = rows.map(parseV4Bill);
      const total_pages = Math.ceil(total / limit) || 1;

      return NextResponse.json({
        data,
        pagination: { page, limit, total, total_pages },
        cached_at: new Date().toISOString(),
        updating: false
      });
    } else {
      // Postgres Fallback for older knessets
      let query = supabase.from('bills').select('*', { count: 'exact' });
      query = query.eq('knesset_num', knesset_num);
      
      if (status_id !== null) {
        query = query.eq('status_id', status_id);
      } else if (has_votes) {
        query = query.in('status_id', [2, 3, 4, 5, 6, 13]);
      }
      
      if (search) query = query.ilike('name', `%${search}%`);
      if (date_from) query = query.gte('publication_date', date_from);
      if (date_to) query = query.lte('publication_date', date_to);

      const from = (page - 1) * limit;
      const to = from + limit - 1;

      const { data: bills, count, error } = await query
        .order('publication_date', { ascending: false, nullsFirst: false })
        .range(from, to);
      
      if (error) throw error;

      // Initiators
      const bill_ids = (bills || []).map(b => b.bill_id);
      let initiatorsMap: Record<number, any[]> = {};

      if (bill_ids.length > 0) {
        const { data: inits } = await supabase.from('bill_initiators').select('bill_id, person_id, ordinal').in('bill_id', bill_ids).eq('is_initiator', true).order('ordinal');
        if (inits && inits.length > 0) {
          const person_ids = inits.map(i => i.person_id);
          const { data: mems } = await supabase.from('members').select('person_id, mk_individual_id, first_name, last_name, first_name_eng, last_name_eng').in('person_id', person_ids);
          
          const memsMap: Record<number, any> = {};
          if (mems) {
            for (const m of mems) memsMap[m.person_id] = m;
          }

          for (const i of inits) {
            if (!initiatorsMap[i.bill_id]) initiatorsMap[i.bill_id] = [];
            const mem = memsMap[i.person_id];
            initiatorsMap[i.bill_id].push({
              mk_individual_id: mem ? mem.mk_individual_id : 0,
              mk_name: mem ? [mem.first_name, mem.last_name].filter(Boolean).join(' ') : `PersonID:${i.person_id}`,
              mk_name_eng: mem ? [mem.first_name_eng, mem.last_name_eng].filter(Boolean).join(' ') : "",
              faction_name: null,
            });
          }
        }
      }

      const data = (bills || []).map(b => ({
        bill_id: b.bill_id,
        knesset_num: b.knesset_num,
        name: b.name || "",
        name_eng: null,
        status_id: b.status_id || 0,
        status_desc: STATUS_MAP[b.status_id || 0] || `סטטוס ${b.status_id}`,
        sub_type_id: b.sub_type_id,
        sub_type_desc: b.sub_type_desc,
        union_type_id: null,
        publication_date: b.publication_date || null,
        publication_num: b.private_number,
        summary_law: b.summary_law,
        is_continuation: b.is_continuation,
        initiators: initiatorsMap[b.bill_id] || [],
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
    console.error("Bills API error:", error);
    return NextResponse.json({ error: "Failed to fetch bills" }, { status: 500 });
  }
}
