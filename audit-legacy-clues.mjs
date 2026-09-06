// =====================================================================
// AUDIT-ONLY (read-only): scan word_senses for legacy Memory Clue format
//   `<word> → <hint>`  (incl. `-> `, `arrange + ment → ...`, whitespace)
// and duplicate words like `average` / `average(adj)` / `average(n)`.
//
// NO writes. NO deletes. Uses PostgREST with whatever key is in .env:
//   SUPABASE_SERVICE_ROLE_KEY first (bypasses RLS for a true global
//   audit), otherwise falls back to VITE_SUPABASE_ANON_KEY (may see
//   fewer rows depending on RLS — script reports which key was used).
// =====================================================================
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
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY;
const keyKind = env.SUPABASE_SERVICE_ROLE_KEY ? 'service_role' : 'anon';
if (!url || !key) { console.error('Missing VITE_SUPABASE_URL or keys in .env'); process.exit(1); }
const headers = { apikey: key, Authorization: `Bearer ${key}` };

async function pagedGet(table, select, { pageSize = 1000, filter = '' } = {}) {
  let out = [];
  let offset = 0;
  let total = null;
  for (;;) {
    const range = `${offset}-${offset + pageSize - 1}`;
    const r = await fetch(
      `${url}/rest/v1/${table}?select=${select}${filter}&limit=${pageSize}&offset=${offset}`,
      { headers: { ...headers, Range: range, Prefer: 'count=exact' } }
    );
    if (!r.ok && r.status !== 206) {
      const body = await r.text().catch(() => '');
      throw new Error(`${table}: HTTP ${r.status} ${body.slice(0, 300)}`);
    }
    const cr = r.headers.get('content-range'); // e.g. "0-999/5432"
    if (cr && cr.split('/')[1] !== '*') total = parseInt(cr.split('/')[1], 10);
    const rows = await r.json();
    out = out.concat(rows);
    offset += pageSize;
    if (!rows.length || (total !== null && offset >= total) || rows.length < pageSize) break;
  }
  return { rows: out, total };
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Legacy clue check: description begins with the word itself (allowing
// legacy decorations like `+ment`, `(adj)`, `(n)` right after), then
// whitespace, then `->` or `→`, then a hint. Also matches when the
// description starts with the word's BASE name (strips embedded type
// markers), so `average(adj)` + `average → ...` is caught too.
function isLegacyClue(word, description) {
  if (!description) return false;
  const d = description.trim();
  const w = (word || '').trim();
  if (!w) return false;
  const candidates = [w, baseName(w)].filter(Boolean);
  for (const c of candidates) {
    const re = new RegExp(
      `^${esc(c)}\\s*(?:\\+\\s*\\w+|\\([^)]*\\))?\\s*(?:→|->)\\s*\\S`,
      'i'
    );
    if (re.test(d)) return true;
  }
  return false;
}
// Classify a legacy clue: 'trivial' when the hint merely restates the
// Vietnamese meaning (e.g. `army → quân đội`), 'mnemonic' when it adds
// real memory value (e.g. `alone → all one → chỉ một mình`,
// `album → an-bum → ...`, `afraid → a + fray → ...`).
function classifyClue(meaning, description) {
  const hint = (description || '').split(/→|->/).pop().trim();
  const m = norm(meaning);
  const h = norm(hint);
  if (!h) return 'mnemonic';
  if (h === m) return 'trivial';
  if (m.length > 3 && (m.includes(h) || h.includes(m))) return 'trivial';
  return 'mnemonic';
}

// Any description that simply contains an arrow (broader candidate pool,
// used to catch false positives and word-embedded-type duplicates).
function hasArrow(description) {
  return /→|->/.test(description || '');
}
const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
// base name for duplicate detection: strip embedded type suffixes
const baseName = (s) =>
  norm(s).replace(/\s*\((?:adj|n|v|verb|noun|adjective|adverb|adv|prep|preposition|conj|conjunction|pron|pronoun|interj|interjection|det|determiner|phrase|phrasal\s*verb)\)\s*$/i, '')
         .replace(/\s*[-–]\s*(?:adj|noun|verb|adverb|adjective)\s*$/i, '');

(async () => {
  console.log(`=== AUDIT legacy memory-clue descriptions (key: ${keyKind}) ===`);
  console.log(`URL: ${url}\n`);
  // ---- 1) Fetch all words + senses (read-only) ----
  const wordsRes = await pagedGet('words', 'id,word,ipa,cefr_level');
  console.log(`words total: ${wordsRes.rows.length} (reported ${wordsRes.total})`);
  const sensesRes = await pagedGet(
    'word_senses',
    'id,word_id,word_type,meaning,description,example,words(id,word)'
  );
  console.log(`word_senses total: ${sensesRes.rows.length} (reported ${sensesRes.total})`);

  const wordById = new Map(wordsRes.rows.map((w) => [w.id, w]));
  const S = sensesRes.rows;

  // ---- 2) Legacy clue candidates ----
  const strictLegacy = [];
  const arrowOnly = [];
  for (const s of S) {
    const w = s.words?.word || wordById.get(s.word_id)?.word || '';
    if (isLegacyClue(w, s.description)) strictLegacy.push({ ...s, word: w });
    else if (hasArrow(s.description)) arrowOnly.push({ ...s, word: w });
  }
  console.log(`\n--- STRICT legacy pattern <word> -> <hint>: ${strictLegacy.length} rows ---`);
  const classCounts = { trivial: 0, mnemonic: 0 };
  for (const r of strictLegacy.slice(0, 200)) {
    const cls = classifyClue(r.meaning, r.description);
    classCounts[cls] = (classCounts[cls] || 0) + 1;
    console.log(JSON.stringify({
      word_sense_id: r.id, word_id: r.word_id, word: r.word,
      word_type: r.word_type, meaning: r.meaning,
      description: r.description, example: r.example,
      classification: cls,
    }));
  }
  console.log(`classification: trivial(restates meaning)=${classCounts.trivial}, mnemonic(real clue)=${classCounts.mnemonic}`);

  if (strictLegacy.length > 200) console.log(`... (+${strictLegacy.length - 200} more)`);
  console.log(`\n--- ARROW but NOT strict word->hint (false-positive pool): ${arrowOnly.length} rows ---`);
  for (const r of arrowOnly.slice(0, 60)) {
    console.log(JSON.stringify({
      word_sense_id: r.id, word: r.word, word_type: r.word_type,
      meaning: (r.meaning || '').slice(0, 60),
      description: (r.description || '').slice(0, 120),
    }));
  }
  if (arrowOnly.length > 60) console.log(`... (+${arrowOnly.length - 60} more)`);
  // ---- 3) Duplicate words (embedded word-type in name) ----
  const byBase = new Map();
  for (const w of wordsRes.rows) {
    const b = baseName(w.word);
    if (!b) continue;
    if (!byBase.has(b)) byBase.set(b, []);
    byBase.get(b).push(w);
  }
  const dupGroups = [...byBase.entries()].filter(([, ws]) => ws.length > 1);
  console.log(`\n--- Duplicate base-word groups: ${dupGroups.length} ---`);
  const sensesByWordId = new Map();
  for (const s of S) {
    if (!sensesByWordId.has(s.word_id)) sensesByWordId.set(s.word_id, []);
    sensesByWordId.get(s.word_id).push(s);
  }
  const dupSenseIds = [];
  for (const [base, ws] of dupGroups) {
    console.log(`\nBASE "${base}" (${ws.length} word rows):`);
    for (const w of ws) {
      const senses = sensesByWordId.get(w.id) || [];
      for (const s of senses) dupSenseIds.push(s.id);
      console.log(`  word_id=${w.id} word="${w.word}" cefr=${w.cefr_level || '-'} senses=${senses.length}`);
      for (const s of senses.slice(0, 5)) {
        console.log(`    sense=${s.id} type=${s.word_type} meaning="${(s.meaning || '').slice(0, 60)}" desc="${(s.description || '').slice(0, 90)}"`);
      }
    }
  }
  // ---- 4) References: set_words / user_progress / user_vocabulary ----
  const legacyIds = strictLegacy.map((r) => r.id);
  const allIds = [...new Set([...legacyIds, ...dupSenseIds])];
  async function refCounts(table, col, ids) {
    const map = new Map();
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100).map((x) => `"${x}"`).join(',');
      const { rows } = await pagedGet(table, col, { filter: `&${col}=in.(${chunk})` });
      for (const r of rows) map.set(r[col], (map.get(r[col]) || 0) + 1);
    }
    return map;
  }
  const result = { strict: legacyIds.length, arrowOnly: arrowOnly.length, dupGroups: dupGroups.length };
  if (allIds.length) {
    const [sw, up, uv] = await Promise.all([
      refCounts('set_words', 'word_sense_id', allIds),
      refCounts('user_progress', 'word_sense_id', allIds),
      refCounts('user_vocabulary', 'word_sense_id', allIds).catch(() => new Map()),
    ]);
    console.log(`\n--- References for ${allIds.length} audited senses ---`);
    console.log(`set_words refs: total=${[...sw.values()].reduce((a, b) => a + b, 0)}, distinct senses=${sw.size}`);
    console.log(`user_progress refs: total=${[...up.values()].reduce((a, b) => a + b, 0)}, distinct senses=${up.size}`);
    console.log(`user_vocabulary refs: total=${[...uv.values()].reduce((a, b) => a + b, 0)}, distinct senses=${uv.size}`);
    const orphans = allIds.filter((id) => !sw.has(id) && !up.has(id) && !uv.has(id));
    console.log(`ORPHAN senses (no set_words/user_progress/user_vocabulary): ${orphans.length}`);
    console.log('orphan ids:', JSON.stringify(orphans.slice(0, 200)));
    console.log('\n--- Per-strict-row refs ---');
    for (const r of strictLegacy) {
      console.log(JSON.stringify({
        word_sense_id: r.id, word: r.word, type: r.word_type,
        set_words: sw.get(r.id) || 0,
        user_progress: up.get(r.id) || 0,
        user_vocabulary: uv.get(r.id) || 0,
      }));
    }
    result.set_words_total = [...sw.values()].reduce((a, b) => a + b, 0);
    result.user_progress_total = [...up.values()].reduce((a, b) => a + b, 0);
    result.orphans = orphans.length;
  }
  // ---- 5) average family trace ----
  console.log('\n--- "average" family ---');
  const avgWords = wordsRes.rows.filter((w) => /^average\b/i.test(w.word));
  for (const w of avgWords) {
    const senses = sensesByWordId.get(w.id) || [];
    for (const s of senses) {
      console.log(JSON.stringify({
        word_id: w.id, word: w.word, word_sense_id: s.id,
        word_type: s.word_type, meaning: s.meaning,
        description: s.description, example: s.example,
        is_legacy_clue: isLegacyClue(w.word, s.description),
      }));
    }
    if (!senses.length) console.log(JSON.stringify({ word_id: w.id, word: w.word, senses: 0 }));
  }

  // ---- 6) Pattern frequency of pre-arrow tokens ----
  const freq = new Map();
  for (const r of strictLegacy) {
    const m = (r.description || '').split(/→|->/)[0].trim();
    freq.set(m, (freq.get(m) || 0) + 1);
  }
  console.log('\n--- Pre-arrow token frequency (top 40) ---');
  [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40)
    .forEach(([t, c]) => console.log(`  ${c}x ${t}`));

  fs.writeFileSync(
    path.join(__dirname, 'audit-legacy-clues-result.json'),
    JSON.stringify({ ...result, classCounts, strictLegacy, arrowOnly, dupGroups: dupGroups.map(([b, ws]) => ({ base: b, words: ws })) }, null, 2)
  );
  console.log('\nSaved machine-readable output to audit-legacy-clues-result.json');




})().catch((e) => { console.error('AUDIT FAILED:', e.message); process.exit(1); });
