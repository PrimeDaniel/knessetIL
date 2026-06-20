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

export async function GET(request: Request, { params }: { params: { bill_id: string } }) {
  const bill_id = parseInt(params.bill_id);

  try {
    // Try OData first
    const odataUrl = `${KNESSET_V4_BASE}/KNS_Bill?$format=json&$filter=Id eq ${bill_id}&$expand=KNS_BillInitiator($expand=KNS_Person)`;
    const res = await fetch(odataUrl, { next: { revalidate: 3600 } });
    if (res.ok) {
      const json = await res.json();
      const rows = json.value || [];
      if (rows.length > 0) {
        return NextResponse.json(parseV4Bill(rows[0]));
      }
    }

    // Fallback: Postgres
    const { data: bill, error } = await supabase.from('bills').select('*').eq('bill_id', bill_id).single();
    if (error || !bill) throw new Error("Bill not found");

    const { data: inits } = await supabase.from('bill_initiators').select('person_id, ordinal').eq('bill_id', bill_id).eq('is_initiator', true).order('ordinal');
    const initiators = [];

    if (inits && inits.length > 0) {
      const person_ids = inits.map(i => i.person_id);
      const { data: mems } = await supabase.from('members').select('person_id, mk_individual_id, first_name, last_name, first_name_eng, last_name_eng').in('person_id', person_ids);
      
      const memsMap: Record<number, any> = {};
      if (mems) {
        for (const m of mems) memsMap[m.person_id] = m;
      }

      for (const i of inits) {
        const mem = memsMap[i.person_id];
        initiators.push({
          mk_individual_id: mem ? mem.mk_individual_id : 0,
          mk_name: mem ? [mem.first_name, mem.last_name].filter(Boolean).join(' ') : `PersonID:${i.person_id}`,
          mk_name_eng: mem ? [mem.first_name_eng, mem.last_name_eng].filter(Boolean).join(' ') : "",
          faction_name: null,
        });
      }
    }

    const data = {
      bill_id: bill.bill_id,
      knesset_num: bill.knesset_num,
      name: bill.name || "",
      name_eng: null,
      status_id: bill.status_id || 0,
      status_desc: STATUS_MAP[bill.status_id || 0] || `סטטוס ${bill.status_id}`,
      sub_type_id: bill.sub_type_id,
      sub_type_desc: bill.sub_type_desc,
      union_type_id: null,
      publication_date: bill.publication_date || null,
      publication_num: bill.private_number,
      summary_law: bill.summary_law,
      is_continuation: bill.is_continuation,
      initiators
    };

    return NextResponse.json(data);
  } catch (error) {
    console.error("Bill Detail API error:", error);
    return NextResponse.json({ error: "Failed to fetch bill detail" }, { status: 404 });
  }
}
