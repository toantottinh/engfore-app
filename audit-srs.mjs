// Probe actual production columns of user_progress via PostgREST.
// Non-invasive: SELECT only. A 200 means column exists; 400 "column not found" means it doesn't.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadEnv(file) {
  const env = {};
  try {
    const content = fs.readFileSync(path.join(__dirname, file), 'utf8');
    for (const line of content.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      const k = t.slice(0, eq).trim();
      let v = t.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      env[k] = v;
    }
  } catch (e) {}
  return env;
}
const env = loadEnv('.env');
const url = (env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const anonKey = env.VITE_SUPABASE_ANON_KEY;
const headers = { apikey: anonKey, Authorization: `Bearer ${anonKey}` };

const candidates = [
  'user_id','sense_id','word_sense_id','word_id',
  'mastery_level','mastery','review_due_at','next_review_at','last_reviewed_at',
  'created_at','updated_at','easiness','repetitions','interval',
];

async function probeColumn(col) {
  const r = await fetch(`${url}/rest/v1/user_progress?select=${col}&limit=1`, { headers });
  if (r.status === 200) return { col, exists: true };
  const body = await r.json().catch(() => ({}));
  const msg = body.message || '';
  if (/not found|does not exist|Unexpected column|could not find/i.test(msg)) return { col, exists: false, msg };
  return { col, unknown: true, status: r.status, msg };
}

(async () => {
  console.log('=== PROBE user_progress columns (anon) ===');
  for (const c of candidates) {
    const res = await probeColumn(c);
    console.log(`  ${res.exists ? '✓ EXISTS  ' : res.unknown ? '? ' + res.status + ' ' : '✗ MISSING '} ${c}${res.msg ? ' :: ' + res.msg.slice(0, 80) : ''}`);
  }
  process.exit(0);
})();
