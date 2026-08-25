-- ============================================================
-- EngFore — Sentence Structures v1 (CHECKPOINT 1)
--
-- Content model:
--   Knowledge : structures -> structure_examples   (global content, admin-managed)
--   Exercises : structures -> structure_exercises  (shared practice bank, NO per-user SRS)
--   User SRS  : user -> user_structures            (per-user learning state)
--
-- Conventions REUSED from the current schema (nothing existing is altered):
--   * uuid PK DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now().
--   * CEFR uses the EXISTING enum public.cefr_level ('A1'..'C2'), like words.cefr_level.
--   * Admin management reuses public.is_admin() (migration 20260818100000) and the
--     same policy style as words / word_senses / topics.
--   * user_structures mirrors the user_progress SRS columns EXACTLY
--     (state/learning_step/repetitions/interval_hours/ease_factor/lapses/
--      review_count/review_due_at/last_reviewed_at/mastery_level) so the existing
--     pure scheduler computeSrsPayload() remains the single source of truth.
--     NO stability/difficulty columns, NO new scheduler.
--   * FK to users follows the ownership-table precedent (user_vocabulary):
--     REFERENCES public.users(id) ON DELETE CASCADE.
--   * Deleting a structure cascades to its examples/exercises/user states
--     (structure is the content root — predictable cleanup).
--
-- Idempotency: CREATE TABLE/INDEX IF NOT EXISTS, DROP POLICY IF EXISTS.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1) structures — global knowledge content (analogous to words)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.structures (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern     text NOT NULL,
  meaning     text NOT NULL,
  explanation text,
  cefr        public.cefr_level,
  topic       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Case-insensitive uniqueness on pattern (same convention as words_word_lower_key).
CREATE UNIQUE INDEX IF NOT EXISTS structures_pattern_lower_key
  ON public.structures (lower(trim(pattern)));

-- Library filters (CEFR filter / Topic filter).
CREATE INDEX IF NOT EXISTS structures_cefr_idx ON public.structures (cefr);
CREATE INDEX IF NOT EXISTS structures_topic_idx ON public.structures (topic);

-- ------------------------------------------------------------
-- 2) structure_examples — knowledge examples (cascade with structure)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.structure_examples (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES public.structures(id) ON DELETE CASCADE,
  sentence     text NOT NULL,
  translation  text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS structure_examples_structure_id_idx
  ON public.structure_examples (structure_id);

-- ------------------------------------------------------------
-- 3) structure_exercises — shared exercise bank (NO user SRS here)
--
--    type: fixed set of 6 V1 exercise types (TEXT + CHECK, mirroring how
--    user_progress.state is constrained — no extra PG enum needed).
--    answer: REQUIRED for deterministic types; OPTIONAL for 'production'
--    (production answers are targets/examples, never a single truth).
--    options: JSONB array (DEFAULT '[]'), per locked decision.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.structure_exercises (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES public.structures(id) ON DELETE CASCADE,
  type         text NOT NULL,
  question     text NOT NULL,
  answer       text NOT NULL DEFAULT '',
  options      jsonb NOT NULL DEFAULT '[]'::jsonb,
  explanation  text,
  created_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT structure_exercises_type_check CHECK (
    type IN ('multiple_choice', 'fill_blank', 'translation',
             'correction', 'rearrange', 'production')
  ),
  -- options must be a JSONB array when present.
  CONSTRAINT structure_exercises_options_array_check CHECK (
    jsonb_typeof(options) = 'array'
  ),
  -- Deterministic types must carry a non-empty answer; production may not.
  CONSTRAINT structure_exercises_answer_check CHECK (
    type = 'production' OR length(trim(answer)) > 0
  ),
  -- A multiple-choice question needs at least two options to choose from.
  CONSTRAINT structure_exercises_mc_options_check CHECK (
    type <> 'multiple_choice'
    OR (jsonb_typeof(options) = 'array' AND jsonb_array_length(options) >= 2)
  )
);

CREATE INDEX IF NOT EXISTS structure_exercises_structure_id_idx
  ON public.structure_exercises (structure_id);

CREATE INDEX IF NOT EXISTS structure_exercises_structure_type_idx
  ON public.structure_exercises (structure_id, type);

-- ------------------------------------------------------------
-- 4) user_structures — per-user Structure SRS state.
--    Column-for-column mirror of user_progress SRS fields so
--    srs.service.js#computeSrsPayload can be reused untouched.
--    PK (user_id, structure_id); upsert onConflict 'user_id,structure_id'.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_structures (
  user_id          uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  structure_id     uuid NOT NULL REFERENCES public.structures(id) ON DELETE CASCADE,

  mastery_level    integer NOT NULL DEFAULT 0,
  state            text NOT NULL DEFAULT 'new',
  learning_step    integer NOT NULL DEFAULT 0,
  repetitions      integer NOT NULL DEFAULT 0,
  interval_hours   integer NOT NULL DEFAULT 0,
  ease_factor      numeric(3,2) NOT NULL DEFAULT 2.50,
  lapses           integer NOT NULL DEFAULT 0,
  review_count     integer NOT NULL DEFAULT 0,
  review_due_at    timestamptz NOT NULL DEFAULT now(),
  last_reviewed_at timestamptz,

  created_at       timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (user_id, structure_id),

  CONSTRAINT user_structures_state_check CHECK (
    state IN ('new', 'learning', 'review', 'relearning')
  ),
  CONSTRAINT user_structures_mastery_check CHECK (
    mastery_level >= 0 AND mastery_level <= 5
  )
);

CREATE INDEX IF NOT EXISTS user_structures_user_id_idx
  ON public.user_structures (user_id);
CREATE INDEX IF NOT EXISTS user_structures_structure_id_idx
  ON public.user_structures (structure_id);
-- Session queue lookups: WHERE user_id = ? AND state IN (...) ORDER BY review_due_at.
CREATE INDEX IF NOT EXISTS user_structures_user_due_idx
  ON public.user_structures (user_id, review_due_at);
CREATE INDEX IF NOT EXISTS user_structures_user_state_idx
  ON public.user_structures (user_id, state);

-- ------------------------------------------------------------
-- 5) RLS — same patterns as the existing schema.
--    Content tables: readable by authenticated users, writable by admins
--    (identical to words / word_senses / topics).
--    user_structures: owner-only FOR ALL (like user_vocabulary / user_settings).
-- ------------------------------------------------------------

-- === structures ===
ALTER TABLE public.structures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view structures." ON public.structures;
CREATE POLICY "Authenticated users can view structures."
  ON public.structures FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins can manage all structures." ON public.structures;
CREATE POLICY "Admins can manage all structures."
  ON public.structures FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- === structure_examples ===
ALTER TABLE public.structure_examples ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view structure examples." ON public.structure_examples;
CREATE POLICY "Authenticated users can view structure examples."
  ON public.structure_examples FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins can manage all structure examples." ON public.structure_examples;
CREATE POLICY "Admins can manage all structure examples."
  ON public.structure_examples FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- === structure_exercises ===
ALTER TABLE public.structure_exercises ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view structure exercises." ON public.structure_exercises;
CREATE POLICY "Authenticated users can view structure exercises."
  ON public.structure_exercises FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins can manage all structure exercises." ON public.structure_exercises;
CREATE POLICY "Admins can manage all structure exercises."
  ON public.structure_exercises FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- === user_structures ===
ALTER TABLE public.user_structures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own structure progress." ON public.user_structures;
CREATE POLICY "Users can manage their own structure progress."
  ON public.user_structures FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 6) Grants — follow the user_vocabulary precedent: table privileges are
--    open to the standard roles and RLS above does the real enforcement.
-- ------------------------------------------------------------
GRANT ALL ON public.structures TO anon, authenticated, service_role;
GRANT ALL ON public.structure_examples TO anon, authenticated, service_role;
GRANT ALL ON public.structure_exercises TO anon, authenticated, service_role;
GRANT ALL ON public.user_structures TO anon, authenticated, service_role;

COMMIT;