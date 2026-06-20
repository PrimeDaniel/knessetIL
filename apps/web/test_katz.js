const { createClient } = require('@supabase/supabase-js');
const client = createClient(
  "https://upjksbqejkzosyezmdts.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVwamtzYnFlamt6b3N5ZXptZHRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MDU4NzQsImV4cCI6MjA5NjA4MTg3NH0.S3QxZ9dAI7qZJJl7RDr99Gb35xZeO9HITySlvteRPf8"
);

async function run() {
  // Find Israel Katz in members table
  const { data: members } = await client.from('members').select('*').ilike('last_name', '%כץ%').ilike('first_name', '%ישראל%');
  console.log('Israel Katz members:', members);

  if (members && members.length > 0) {
    const mkId = members[0].mk_individual_id;
    // Find his factions
    const { data: factions } = await client.from('member_factions').select('*').eq('mk_individual_id', mkId);
    console.log('Israel Katz Faction History in DB:', factions);
  }
}

run().catch(console.error);
