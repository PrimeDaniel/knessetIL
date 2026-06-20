const KNESSET_V4_BASE = "https://knesset.gov.il/OdataV4/ParliamentInfo";

async function run() {
  const url = `${KNESSET_V4_BASE}/KNS_PersonToPosition?$format=json&$filter=FactionID ne null&$top=200`;
  const res = await fetch(url);
  const j = await res.ok ? await res.json() : { value: [] };
  const positionIds = Array.from(new Set(j.value.map(p => p.PositionID)));
  console.log('Position IDs found:', positionIds);
  
  // Let's resolve the names of these Position IDs
  for (const pid of positionIds) {
    const r = await fetch(`${KNESSET_V4_BASE}/KNS_Position(${pid})?$format=json`);
    const p = await r.ok ? await r.json() : { Description: 'Unknown' };
    console.log(`Position ID ${pid}: ${p.Description}`);
  }
}

run().catch(console.error);
