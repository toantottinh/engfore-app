-- ============================================================
-- Word Set v2 — global word_senses ownership layer.
--
-- Decisions (locked):
--   * word_senses stays GLOBAL (many senses per word/type allowed).
--   * Adds user_vocabulary as the ownership/association entity.
--
-- Steps:
--   1) words.word unique -> case-insensitive (audit: no dup by lower).
--   2) Consolidate existing duplicate word_senses sharing canonical
--      identity (word_id + word_type + normalize(meaning)); reassign
--      set_words / user_progress refs, merge descriptor fields into
--      the keeper so no info is lost. (Audit: 1 user, senses are
--      clones -> safe.)
--   3) Create user_vocabulary + RLS + grants + indexes.
--   4) Canonical UNIQUE functional index on word_senses.
--   5) user_progress.word_sense_id FK CASCADE -> RESTRICT.
--   6) RLS policy for user_vocabulary.
--   7) Backfill user_vocabulary from existing Word Sets + progress.
--
-- Idempotency: guarded with IF NOT EXISTS / IF EXISTS where possible.
-- ============================================================

BEGIN;

-- 1) words: unique case-insensitive (drop redundant non-unique idx + case-sensitive unique)
DROP INDEX IF EXISTS public.words_word_idx;
ALTER TABLE public.words DROP CONSTRAINT IF EXISTS words_word_key;
CREATE UNIQUE INDEX words_word_lower_key ON public.words (lower(word));

-- 2) Consolidate duplicate word_senses sharing canonical identity
CREATE TEMP TABLE _dup AS
SELECT id AS sense_id,
       first_value(id) OVER (
         PARTITION BY word_id, word_type, mkey
         ORDER BY refs DESC, id ASC
       ) AS keeper
FROM (
  SELECT ws.id, ws.word_id, ws.word_type,
         regexp_replace(trim(lower(coalesce(ws.meaning,''))), '\s+', ' ', 'g') AS mkey,
         (SELECT count(*) FROM public.set_words sw WHERE sw.word_sense_id = ws.id)
         + (SELECT count(*) FROM public.user_progress up WHERE up.word_sense_id = ws.id) AS refs
  FROM public.word_senses ws
) g;

-- 2a) reassign set_words to keeper (skip if that (set, keeper) already exists)
UPDATE public.set_words sw
SET word_sense_id = d.keeper
FROM _dup d
WHERE sw.word_sense_id = d.sense_id
  AND d.sense_id <> d.keeper
  AND NOT EXISTS (
    SELECT 1 FROM public.set_words k
    WHERE k.set_id = sw.set_id AND k.word_sense_id = d.keeper
  );

DELETE FROM public.set_words sw
USING _dup d
WHERE sw.word_sense_id = d.sense_id AND d.sense_id <> d.keeper;

-- 2b) reassign user_progress to keeper (skip PK conflicts)
UPDATE public.user_progress up
SET word_sense_id = d.keeper
FROM _dup d
WHERE up.word_sense_id = d.sense_id
  AND d.sense_id <> d.keeper
  AND NOT EXISTS (
    SELECT 1 FROM public.user_progress k
    WHERE k.user_id = up.user_id AND k.word_sense_id = d.keeper
  );

DELETE FROM public.user_progress up
USING _dup d
WHERE up.word_sense_id = d.sense_id AND d.sense_id <> d.keeper;

-- 2c) fill empty description/example into keepers from the merged senses
UPDATE public.word_senses ws
SET description = COALESCE(
      NULLIF(ws.description,''),
      (SELECT NULLIF(o.description,'')
         FROM public.word_senses o
         JOIN _dup d ON d.sense_id = o.id
        WHERE d.keeper = ws.id AND d.sense_id <> d.keeper
          AND NULLIF(o.description,'') IS NOT NULL
        LIMIT 1)
    ),
    example = COALESCE(
      NULLIF(ws.example,''),
      (SELECT NULLIF(o.example,'')
         FROM public.word_senses o
         JOIN _dup d ON d.sense_id = o.id
        WHERE d.keeper = ws.id AND d.sense_id <> d.keeper
          AND NULLIF(o.example,'') IS NOT NULL
        LIMIT 1)
    )
WHERE ws.id IN (SELECT keeper FROM _dup);

-- 2d) delete merged-away senses
DELETE FROM public.word_senses ws
USING _dup d
WHERE ws.id = d.sense_id AND d.sense_id <> d.keeper;

DROP TABLE _dup;

-- 3) user_vocabulary ownership table
CREATE TABLE IF NOT EXISTS public.user_vocabulary (
  user_id       uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  word_sense_id uuid        NOT NULL REFERENCES public.word_senses(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, word_sense_id)
);

ALTER TABLE public.user_vocabulary ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.user_vocabulary TO anon, authenticated, service_role;

CREATE INDEX IF NOT EXISTS user_vocabulary_user_id_idx  ON public.user_vocabulary (user_id);
CREATE INDEX IF NOT EXISTS user_vocabulary_sense_id_idx ON public.user_vocabulary (word_sense_id);

-- 4) canonical UNIQUE functional index (safe now that duplicates are consolidated)
CREATE UNIQUE INDEX word_senses_canonical_key
  ON public.word_senses (
    word_id,
    word_type,
    regexp_replace(trim(lower(coalesce(meaning,''))), '\s+', ' ', 'g')
  );

-- 5) user_progress.word_sense_id CASCADE -> RESTRICT (protect shared-sense progress)
ALTER TABLE public.user_progress DROP CONSTRAINT user_progress_word_sense_id_fkey;
ALTER TABLE public.user_progress
  ADD CONSTRAINT user_progress_word_sense_id_fkey
  FOREIGN KEY (word_sense_id) REFERENCES public.word_senses(id) ON DELETE RESTRICT;

-- 6) RLS policy for user_vocabulary
CREATE POLICY "Users can manage their own vocabulary ownership."
  ON public.user_vocabulary FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 7) backfill user_vocabulary from existing Word Sets + progress
INSERT INTO public.user_vocabulary (user_id, word_sense_id)
SELECT DISTINCT user_id, word_sense_id
FROM (
  SELECT vs.user_id AS user_id, sw.word_sense_id AS word_sense_id
  FROM public.set_words sw
  JOIN public.vocabulary_sets vs ON vs.id = sw.set_id
  UNION
  SELECT up.user_id, up.word_sense_id
  FROM public.user_progress up
) b
ON CONFLICT (user_id, word_sense_id) DO NOTHING;

COMMIT;