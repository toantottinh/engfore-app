-- =====================================================================
-- AUDIT / CLEANUP SQL — Legacy Memory Clue `<word> → <hint>` + duplicate
-- `word(adj)` / `word(n)` words.
--
-- RUN WITH: Supabase SQL Editor (service role / postgres role) — the
-- anon key CANNOT see user-owned rows through RLS, so reference counts
-- from a frontend audit are only lower bounds. Run these queries for
-- the DEFINITIVE audit before any cleanup decision.
--
-- Snapshot (2026-09-05, anon audit via audit-legacy-clues.mjs):
--   * BEFORE external cleanup: 1891 words / 2084 senses,
--     43 rows matching strict `<word> → <hint>` (+2 `average(adj)` /
--     `average(n)` matched via base name), 1 duplicate group (`average`).
--   * AFTER the external cleanup (same day): 1853 words / 2024 senses,
--     0 legacy-pattern rows, 0 duplicate groups, canonical `average`
--     remains with modern description. Verified by re-running the audit.
--
-- SAFETY RULES (do not violate):
--   * words / word_senses are SHARED GLOBAL content. Never DELETE them
--     based on the description pattern alone.
--   * Any DELETE must be scoped by exact ids AND verified reference
--     counts (set_words / user_progress / user_vocabulary = 0).
--   * Never bulk-delete user_progress or word_senses.
-- =====================================================================

-- Q1. Total counts -----------------------------------------------------
SELECT
  (SELECT count(*) FROM public.words)       AS words_total,
  (SELECT count(*) FROM public.word_senses) AS senses_total;


-- Q2. Legacy `<word> → <hint>` rows (strict pattern, incl. variants). --
SELECT ws.id            AS word_sense_id,
       w.id             AS word_id,
       w.word,
       ws.word_type,
       ws.meaning,
       ws.description,
       ws.example
FROM public.word_senses ws
JOIN public.words w ON w.id = ws.word_id
WHERE ws.description ~ ('^\s*'
    || regexp_replace(w.word, '([\\.^$|()\\[\\]{}*+?])', '\\\1', 'g')
    || '\s*(\+\s*\w+|\([^)]*\))?\s*(→|->)\s*\S')
   OR ws.description ~ ('^\s*'
    || regexp_replace(
         regexp_replace(lower(w.word),
           '\s*\((adj|n|v|verb|noun|adjective|adverb|adv|prep|preposition|conj|conjunction|pron|pronoun|interj|interjection|det|determiner|phrase|phrasal_?verb|expression)\)\s*$', '', 'i'),
         '([\\.^$|()\\[\\]{}*+?])', '\\\1', 'g')
    || '\s*(\+\s*\w+|\([^)]*\))?\s*(→|->)\s*\S')
ORDER BY w.word;

-- Q2b. False-positive pool: any other arrow in descriptions.
SELECT ws.id, w.word, ws.word_type, ws.meaning, ws.description
FROM public.word_senses ws
JOIN public.words w ON w.id = ws.word_id
WHERE (ws.description LIKE '%→%' OR ws.description LIKE '%->%')
  AND ws.description !~ ('^\s*' || w.word || '\s*(\+\s*\w+|\([^)]*\))?\s*(→|->)\s*\S');


-- Q3a. Words that STILL carry an embedded type marker in the name. -----
SELECT w.id AS word_id, w.word, w.cefr_level,
       (SELECT count(*) FROM public.word_senses s WHERE s.word_id = w.id) AS senses
FROM public.words w
WHERE w.word ~* '\((adj|n|v|verb|noun|adjective|adverb|adv|prep|preposition|conj|conjunction|pron|pronoun|interj|interjection|det|determiner|phrase|phrasal_?verb|expression)\)\s*$'
ORDER BY w.word;

-- Q3b. Any remaining base-name duplicate groups (post-strip). ----------
SELECT base, count(*) AS word_rows,
       array_agg(word_id || ':' || word) AS members
FROM (
  SELECT w.id AS word_id, w.word,
         lower(regexp_replace(w.word,
           '\s*\((adj|n|v|verb|noun|adjective|adverb|adv|prep|preposition|conj|conjunction|pron|pronoun|interj|interjection|det|determiner|phrase|phrasal_?verb|expression)\)\s*$', '', 'i')) AS base
  FROM public.words w
) t
GROUP BY base
HAVING count(*) > 1
ORDER BY base;

-- Q4. Reference counts for given sense ids (paste ids). ----------------
WITH ids AS (
  SELECT id FROM public.word_senses WHERE id IN ('<paste-sense-ids-here>')
)
SELECT
  (SELECT count(*) FROM public.set_words sw       JOIN ids i ON i.id = sw.word_sense_id)       AS set_words_refs,
  (SELECT count(*) FROM public.user_progress up   JOIN ids i ON i.id = up.word_sense_id)       AS user_progress_refs,
  (SELECT count(*) FROM public.user_vocabulary uv JOIN ids i ON i.id = uv.word_sense_id)       AS user_vocabulary_refs;

-- Q5. Orphans among those ids (zero refs everywhere). ------------------
WITH ids AS (
  SELECT id FROM public.word_senses WHERE id IN ('<paste-sense-ids-here>')
)
SELECT i.id
FROM ids i
WHERE NOT EXISTS (SELECT 1 FROM public.set_words sw       WHERE sw.word_sense_id = i.id)
  AND NOT EXISTS (SELECT 1 FROM public.user_progress up   WHERE up.word_sense_id = i.id)
  AND NOT EXISTS (SELECT 1 FROM public.user_vocabulary uv WHERE uv.word_sense_id = i.id);

-- =====================================================================
-- CONDITIONAL CLEANUP TEMPLATES (ONLY after Q4/Q5 prove zero refs).
-- Content refreshes / ownership-safe re-points — NOT deletes of shared
-- rows. Do not run blindly.
-- =====================================================================

-- GROUP C: refresh a legacy `word → hint` description on a sense that
-- is canonical/current, ONLY with authoritative replacement text:
-- UPDATE public.word_senses
-- SET description = '<authoritative memory clue>'
-- WHERE id = '<word_sense_id>'
--   AND description ~ ('^\s*<word>\s*(→|->)\s*');

-- GROUP B: re-point a user's ownership from a duplicate sense to the
-- canonical sense, per-user, ONLY after Q4 (scoped to other users):
-- UPDATE public.user_vocabulary uv SET word_sense_id = '<canonical-sense>'
-- WHERE uv.word_sense_id = '<duplicate-sense>'
--   AND NOT EXISTS (SELECT 1 FROM public.user_vocabulary u2
--                   WHERE u2.user_id = uv.user_id
--                     AND u2.word_sense_id = '<canonical-sense>');
-- (mirror for user_progress and set_words; NEVER global.)

-- GROUP A: delete an orphaned DUPLICATE sense (and a `word(adj)` word
-- row only when it has zero senses left) — ONLY with exact ids proven
-- orphan by Q5:
-- DELETE FROM public.word_senses WHERE id IN ('<verified-orphan-ids>');
-- DELETE FROM public.words w
-- WHERE w.word ~* '\((adj|n|v)\)\s*$'
--   AND NOT EXISTS (SELECT 1 FROM public.word_senses s WHERE s.word_id = w.id);


