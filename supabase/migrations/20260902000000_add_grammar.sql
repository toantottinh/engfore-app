-- ============================================================
-- EngFore — Grammar (Ngữ pháp) v1
--
-- Content model (mirror Sentence Structures):
--   Knowledge : grammar_topics -> grammar_rules   (global content, admin-managed)
--   Exercises : grammar_rules -> grammar_exercises (shared practice bank,
--               NO per-user SRS — exercise KHÔNG bao giờ là SRS item)
--   User SRS  : user -> user_grammar              (per-user learning state)
--
-- Conventions REUSED from the current schema (nothing existing is altered):
--   * uuid PK DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now().
--   * CEFR uses the EXISTING enum public.cefr_level ('A1'..'C2'), like
--     structures.cefr / words.cefr_level.
--   * Admin management reuses public.is_admin() (migration 20260818100000) and
--     the same policy style as structures / structure_exercises.
--   * user_grammar mirrors user_structures SRS columns EXACTLY
--     (state/learning_step/repetitions/interval_hours/ease_factor/lapses/
--      review_count/review_due_at/last_reviewed_at/mastery_level/last_rating)
--     so the existing pure scheduler computeSrsPayload() in
--     src/services/srs.service.js remains the SINGLE SOURCE OF TRUTH.
--     NO stability/difficulty columns, NO new scheduler, NO grammar SRS engine.
--   * FK to users follows the ownership-table precedent (user_vocabulary /
--     user_structures): REFERENCES public.users(id) ON DELETE CASCADE.
--   * Deleting a topic cascades to its rules/exercises/user states
--     (topic is the content root — predictable cleanup).
--
-- SRS ownership: /learn area ONLY. No SRS has ever lived on grammar
-- content rows here; user_grammar is created/managed per user by the
-- learning flow (same invariants as user_structures).
--
-- Idempotency: CREATE TABLE/INDEX IF NOT EXISTS, DROP POLICY IF EXISTS.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1) grammar_topics — global knowledge sections (analogous to structures)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.grammar_topics (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  description text,
  cefr        public.cefr_level,
  category    text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Case-insensitive uniqueness on title (same convention as structures_pattern_lower_key).
CREATE UNIQUE INDEX IF NOT EXISTS grammar_topics_title_lower_key
  ON public.grammar_topics (lower(trim(title)));

-- Library filters (CEFR group / category filter).
CREATE INDEX IF NOT EXISTS grammar_topics_cefr_idx ON public.grammar_topics (cefr);
CREATE INDEX IF NOT EXISTS grammar_topics_category_idx ON public.grammar_topics (category);