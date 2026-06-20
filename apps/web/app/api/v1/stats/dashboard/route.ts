import { NextResponse } from 'next/server';

const KNESSET_V4_BASE = "https://knesset.gov.il/OdataV4/ParliamentInfo";
const CURRENT_KNESSET = 25;
const V4_STATUS_BECAME_LAW = 118;
const KNESSET_SEATS = 120;

const V4_RESULT_CODE_MAP: Record<number, string> = {
  7: "for",
  8: "against",
  9: "abstain",
  6: "absent",
};

export async function GET() {
  try {
    const [votesRes, billsRes, billsBecameLawRes] = await Promise.all([
      fetch(`${KNESSET_V4_BASE}/KNS_PlenumVote?$top=10&$skip=0&$count=true&$orderby=VoteDateTime desc&$expand=VoteResults&$format=json`, { 
        next: { revalidate: 900 } // Cache for 15 minutes
      }),
      fetch(`${KNESSET_V4_BASE}/KNS_Bill?$top=10&$skip=0&$count=true&$orderby=LastUpdatedDate desc&$expand=KNS_BillInitiator($expand=KNS_Person)&$filter=KnessetNum eq ${CURRENT_KNESSET}&$format=json`, { 
        next: { revalidate: 900 }
      }),
      fetch(`${KNESSET_V4_BASE}/KNS_Bill?$count=true&$top=1&$filter=KnessetNum eq ${CURRENT_KNESSET} and StatusID eq ${V4_STATUS_BECAME_LAW}&$format=json`, { 
        next: { revalidate: 900 }
      })
    ]);

    const votesData = await votesRes.json().catch(() => ({ value: [], "@odata.count": 0 }));
    const billsData = await billsRes.json().catch(() => ({ value: [], "@odata.count": 0 }));
    const billsBecameLawData = await billsBecameLawRes.json().catch(() => ({ "@odata.count": 0 }));

    const recent_votes = (votesData.value || []).map((v: any) => {
      let vote_date = "";
      if (v.VoteDateTime) {
        vote_date = v.VoteDateTime.split("T")[0];
      }

      // Compute totals from VoteResults
      const counts = { "for": 0, "against": 0, "abstain": 0, "absent": 0 };
      if (v.VoteResults && Array.isArray(v.VoteResults)) {
        for (const r of v.VoteResults) {
          const decision = V4_RESULT_CODE_MAP[r.ResultCode || 0] || "absent";
          counts[decision as keyof typeof counts]++;
        }
      }

      return {
        vote_id: v.Id || 0,
        vote_date: vote_date,
        vote_item_dscr: (v.VoteTitle || v.VoteSubject || "").trim(),
        sess_item_dscr: (v.VoteSubject || "").trim(),
        vote_type: 0,
        session_num: v.SessionID || 0,
        is_accepted: counts["for"] > counts["against"],
        total_for: counts["for"],
        total_against: counts["against"],
        total_abstain: counts["abstain"],
      };
    });

    const recent_bills = (billsData.value || []).map((b: any) => {
      const initiators = b.KNS_BillInitiator || [];
      let initiator_name = null;
      if (initiators.length > 0 && initiators[0].KNS_Person) {
        const p = initiators[0].KNS_Person;
        initiator_name = `${p.FirstName || ''} ${p.LastName || ''}`.trim();
      }

      let pubDate = null;
      if (b.PublicationDate) {
        pubDate = b.PublicationDate.split("T")[0];
      }

      return {
        bill_id: b.Id,
        name: b.Name,
        status_desc: b.StatusDesc,
        publication_date: pubDate,
        initiator_name,
      };
    });

    const response = {
      knesset_num: CURRENT_KNESSET,
      total_votes_this_knesset: votesData['@odata.count'] || 0,
      total_bills: billsData['@odata.count'] || 0,
      total_active_mks: KNESSET_SEATS,
      bills_passed_into_law: billsBecameLawData['@odata.count'] || 0,
      recent_votes,
      recent_bills,
      cached_at: new Date().toISOString(),
      updating: false
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Dashboard API error:", error);
    return NextResponse.json({ error: "Failed to fetch dashboard data" }, { status: 500 });
  }
}
