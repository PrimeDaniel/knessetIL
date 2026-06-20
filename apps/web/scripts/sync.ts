// @ts-nocheck
import { Client } from "pg";
import { parse } from "csv-parse";
import * as dotenv from "dotenv";

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;
const OKNESSET_BASE_URL = "https://production.oknesset.org/pipelines/data";

async function fetchCsv(path: string): Promise<any[]> {
  const url = `${OKNESSET_BASE_URL}/${path}`;
  console.log(`Fetching CSV: ${url}`);
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
  }
  
  const text = await response.text();
  
  return new Promise((resolve, reject) => {
    parse(text, { columns: true, skip_empty_lines: true }, (err, records) => {
      if (err) reject(err);
      else resolve(records);
    });
  });
}

// Example: Porting _sync_members
async function syncMembers(client: Client) {
  console.log("Syncing members...");
  const records = await fetchCsv("members/mk_individual/mk_individual.csv");
  
  for (const r of records) {
    const mkId = parseInt(r.mk_individual_id);
    if (isNaN(mkId)) continue;
    
    await client.query(`
      INSERT INTO members (
        mk_individual_id, person_id, last_name, last_name_eng, 
        first_name, first_name_eng, photo_url, email, gender_desc, 
        is_current, synced_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      ON CONFLICT (mk_individual_id) DO UPDATE SET
        person_id = EXCLUDED.person_id,
        last_name = EXCLUDED.last_name,
        last_name_eng = EXCLUDED.last_name_eng,
        first_name = EXCLUDED.first_name,
        first_name_eng = EXCLUDED.first_name_eng,
        photo_url = EXCLUDED.photo_url,
        email = EXCLUDED.email,
        gender_desc = EXCLUDED.gender_desc,
        is_current = EXCLUDED.is_current,
        synced_at = NOW()
    `, [
      mkId,
      parseInt(r.PersonID) || null,
      r.mk_individual_name || null,
      r.mk_individual_name_eng || null,
      r.mk_individual_first_name || null,
      r.mk_individual_first_name_eng || null,
      r.mk_individual_photo || null,
      r.mk_individual_email || r.Email || null,
      r.GenderDesc || null,
      r.IsCurrent === "1" || r.IsCurrent === "true",
    ]);
  }
  
  console.log(`Synced ${records.length} members.`);
}

async function runSync() {
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is required.");
  }
  
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  console.log("Connected to database.");
  
  try {
    await client.query("BEGIN");
    
    await syncMembers(client);
    // TODO: Add other sync functions (factions, bills, votes)
    
    await client.query("COMMIT");
    console.log("Sync completed successfully.");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Sync failed:", error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

// Run if called directly
if (require.main === module) {
  runSync().catch(console.error);
}
