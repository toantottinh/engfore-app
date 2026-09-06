-- =====================================================================
-- PHASE 3: Migrate vocabulary data from legacy tables
-- =====================================================================
-- This migration creates vocabulary_items and vocabulary_versions
-- from existing user_vocabulary and set_words data.

BEGIN;

-- Step 1: Create vocabulary_items from user_vocabulary
-- Each unique (user_id, word_sense_id) becomes one vocabulary_item
INSERT INTO public.vocabulary_items (
    user_id,
    word,
    word_type,
    meaning,
    word_id,
    word_sense_id,
    created_at
)
SELECT DISTINCT ON (uv.user_id, uv.word_sense_id)
    uv.user_id,
    w.word,
    ws.word_type,
    ws.meaning,
    w.id AS word_id,
    ws.id AS word_sense_id,
    uv.created_at
FROM public.user_vocabulary uv
JOIN public.word_senses ws ON uv.word_sense_id = ws.id
JOIN public.words w ON ws.word_id = w.id
ORDER BY uv.user_id, uv.word_sense_id, uv.created_at ASC
ON CONFLICT (user_id, lower(regexp_replace(trim(word), '\s+', ' ', 'g')), word_type, lower(regexp_replace(trim(meaning), '\s+', ' ', 'g'))) 
DO NOTHING;

-- Step 2: Create vocabulary_versions + version_sets
-- Deterministic, one version per (vocabulary_item, set):
--   1) materialize the mapping (item, set, context, created_at) in a temp table,
--   2) insert one vocabulary_versions row per mapping row (generated id),
--   3) insert one version_sets row from the SAME mapping (exact version<->set link).
-- This avoids the cross-product join that would create duplicate (set, item) rows.
-- NOTE: legacy set_words has NO created_at column (only set_id, word_sense_id),
-- so the version timestamp comes from user_vocabulary.created_at.
CREATE TEMP TABLE _vv_map AS
SELECT DISTINCT ON (uv.user_id, uv.word_sense_id, sw.set_id)
    uuid_generate_v4() AS version_id,
    vi.id AS item_id,
    sw.set_id,
    uv.example,
    uv.memory_clue,
    uv.created_at AS created_at
FROM public.user_vocabulary uv
JOIN public.word_senses ws ON uv.word_sense_id = ws.id
JOIN public.words w ON ws.word_id = w.id
JOIN public.vocabulary_items vi ON vi.word_sense_id = uv.word_sense_id AND vi.user_id = uv.user_id
JOIN public.set_words sw ON sw.word_sense_id = uv.word_sense_id
JOIN public.vocabulary_sets vs ON sw.set_id = vs.id AND vs.user_id = uv.user_id
ORDER BY uv.user_id, uv.word_sense_id, sw.set_id, uv.created_at ASC;

INSERT INTO public.vocabulary_versions (
    id,
    vocabulary_item_id,
    example,
    memory_clue,
    created_at
)
SELECT
    version_id,
    item_id,
    example,
    memory_clue,
    created_at
FROM _vv_map;

INSERT INTO public.version_sets (
    version_id,
    set_id,
    vocabulary_item_id,
    created_at
)
SELECT
    version_id,
    set_id,
    item_id,
    created_at
FROM _vv_map;

DROP TABLE _vv_map;

-- Step 4: Set last_viewed_version_id to Main Version (oldest) for each item
UPDATE public.vocabulary_items vi
SET last_viewed_version_id = (
    SELECT vv.id 
    FROM public.vocabulary_versions vv 
    WHERE vv.vocabulary_item_id = vi.id 
    ORDER BY vv.created_at ASC, vv.id ASC 
    LIMIT 1
)
WHERE vi.last_viewed_version_id IS NULL;

COMMIT;

