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
-- ------------------------------------------------------------
-- 2) grammar_rules — knowledge items (SRS unit). Mỗi rule ngắn, dùng độc lập
--    để tạo bài tập. One rule = ONE SRS card per user (user_grammar).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.grammar_rules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id    uuid NOT NULL REFERENCES public.grammar_topics(id) ON DELETE CASCADE,
  title       text NOT NULL,
  rule        text NOT NULL,
  explanation text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS grammar_rules_topic_id_idx ON public.grammar_rules (topic_id);

-- Dedupe rule title within a topic (case-insensitive, trimmed) — mirrors
-- structures_pattern_lower_key convention. Import upserts by this key.
CREATE UNIQUE INDEX IF NOT EXISTS grammar_rules_topic_title_lower_key
  ON public.grammar_rules (topic_id, lower(trim(title)));

-- ------------------------------------------------------------
-- 3) grammar_exercises — shared practice bank (NO user SRS here).
--    Mirror structure_exercises: same 6 V1 types + same CHECKs so the
--    EXISTING exercise engine (checkExerciseAnswer / ExerciseRenderer)
--    works unchanged on grammar rows.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.grammar_exercises (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id     uuid NOT NULL REFERENCES public.grammar_rules(id) ON DELETE CASCADE,
  type        text NOT NULL,
  question    text NOT NULL,
  answer      text NOT NULL DEFAULT '',
  options     jsonb NOT NULL DEFAULT '[]'::jsonb,
  explanation text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT grammar_exercises_type_check CHECK (
    type IN ('multiple_choice', 'fill_blank', 'translation',
             'correction', 'rearrange', 'production')
  ),
  CONSTRAINT grammar_exercises_options_array_check CHECK (
    jsonb_typeof(options) = 'array'
  ),
  CONSTRAINT grammar_exercises_answer_check CHECK (
    type = 'production' OR length(trim(answer)) > 0
  ),
  CONSTRAINT grammar_exercises_mc_options_check CHECK (
    type <> 'multiple_choice'
    OR (jsonb_typeof(options) = 'array' AND jsonb_array_length(options) >= 2)
  )
);

CREATE INDEX IF NOT EXISTS grammar_exercises_rule_id_idx ON public.grammar_exercises (rule_id);

-- ------------------------------------------------------------
-- 4) user_grammar — per-user SRS state for ONE (user, grammar_rule).
--    Mirrors user_structures SRS columns EXACTLY (incl. last_rating from
--    migration 20260901000000) so the single scheduler computeSrsPayload()
--    is reused by pure field mapping — NO new scheduler, NO new engine.
--    Invariants (identical to user_structures):
--      * ONE user + ONE rule = ĐÚNG MỘT SRS state row (PK composite).
--      * Exercise KHÔNG bao giờ là SRS item — không có exercise_id ở đây.
--      * last_rating = metadata buổi gặp (0/2/3/4) trên cùng thẻ SRS.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_grammar (
  user_id          uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  rule_id          uuid NOT NULL REFERENCES public.grammar_rules(id) ON DELETE CASCADE,

  mastery_level    integer NOT NULL DEFAULT 0,
  state            text NOT NULL DEFAULT 'new',
  learning_step    integer NOT NULL DEFAULT 0,
  repetitions      integer NOT NULL DEFAULT 0,
  interval_hours   integer NOT NULL DEFAULT 0,
  ease_factor      numeric(3,2) NOT NULL DEFAULT 2.50,
  lapses           integer NOT NULL DEFAULT 0,
  review_count     integer NOT NULL DEFAULT 0,
  last_rating      smallint,
  review_due_at    timestamptz NOT NULL DEFAULT now(),
  last_reviewed_at timestamptz,

  created_at       timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (user_id, rule_id),

  CONSTRAINT user_grammar_state_check CHECK (
    state IN ('new', 'learning', 'review', 'relearning')
  ),
  CONSTRAINT user_grammar_mastery_check CHECK (
    mastery_level >= 0 AND mastery_level <= 5
  )
);

-- Session queue lookups: WHERE user_id = ? AND state IN (...) ORDER BY review_due_at.
CREATE INDEX IF NOT EXISTS user_grammar_user_due_idx
  ON public.user_grammar (user_id, review_due_at);
CREATE INDEX IF NOT EXISTS user_grammar_user_state_idx
  ON public.user_grammar (user_id, state);
CREATE INDEX IF NOT EXISTS user_grammar_rule_id_idx
  ON public.user_grammar (rule_id);

-- ------------------------------------------------------------
-- 5) RLS — same patterns as the existing schema.
--    Content tables: readable by authenticated users, writable by admins
--    (identical to structures / structure_exercises).
--    user_grammar: owner-only FOR ALL (like user_structures / user_progress).
-- ------------------------------------------------------------

-- === grammar_topics ===
ALTER TABLE public.grammar_topics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view grammar topics." ON public.grammar_topics;
CREATE POLICY "Authenticated users can view grammar topics."
  ON public.grammar_topics FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins can manage all grammar topics." ON public.grammar_topics;
CREATE POLICY "Admins can manage all grammar topics."
  ON public.grammar_topics FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- === grammar_rules ===
ALTER TABLE public.grammar_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view grammar rules." ON public.grammar_rules;
CREATE POLICY "Authenticated users can view grammar rules."
  ON public.grammar_rules FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins can manage all grammar rules." ON public.grammar_rules;
CREATE POLICY "Admins can manage all grammar rules."
  ON public.grammar_rules FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- === grammar_exercises ===
ALTER TABLE public.grammar_exercises ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view grammar exercises." ON public.grammar_exercises;
CREATE POLICY "Authenticated users can view grammar exercises."
  ON public.grammar_exercises FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins can manage all grammar exercises." ON public.grammar_exercises;
CREATE POLICY "Admins can manage all grammar exercises."
  ON public.grammar_exercises FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- === user_grammar ===
ALTER TABLE public.user_grammar ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own grammar progress." ON public.user_grammar;
CREATE POLICY "Users can manage their own grammar progress."
  ON public.user_grammar FOR ALL
  USING (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 6) Admin import RPCs — mirror import_structures / import_structure_exercises:
--    * SECURITY DEFINER SET search_path = public.
--    * Admin-only via public.is_admin() (migration 20260818100000).
--    * Server-side normalization + validation per row; bad rows counted in
--      `errored` and skipped.
--    * NO SRS state is imported — user_grammar is created/managed per user
--      by the learning flow, never from content imports.
-- ------------------------------------------------------------

DROP FUNCTION IF EXISTS public.import_grammar_topics(jsonb);

CREATE OR REPLACE FUNCTION public.import_grammar_topics(
  p_rows jsonb
)
RETURNS TABLE(created int, updated int, errored int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item      jsonb;
  v_topic     uuid;
  v_title     text;
  v_desc      text;
  v_cefr      text;
  v_category  text;
  v_created   int := 0;
  v_updated   int := 0;
  v_errored   int := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can import grammar topics.';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_title := trim(coalesce(v_item->>'title', ''));
    IF v_title = '' THEN
      v_errored := v_errored + 1;
      CONTINUE;
    END IF;

    -- CEFR: optional, but must be a valid level when present (strict,
    -- same rule as import_words / import_structures).
    v_cefr := nullif(upper(trim(coalesce(v_item->>'cefr', ''))), '');
    IF v_cefr IS NOT NULL AND v_cefr NOT IN ('A1','A2','B1','B2','C1','C2') THEN
      v_errored := v_errored + 1;
      CONTINUE;
    END IF;

    v_desc     := nullif(trim(coalesce(v_item->>'description', '')), '');
    v_category := nullif(trim(coalesce(v_item->>'category', '')), '');

    -- Upsert-by-title matching grammar_topics_title_lower_key.
    SELECT id INTO v_topic
    FROM public.grammar_topics
    WHERE lower(trim(title)) = lower(v_title);

    IF v_topic IS NULL THEN
      INSERT INTO public.grammar_topics (title, description, cefr, category)
      VALUES (v_title, v_desc, v_cefr::public.cefr_level, v_category);
      v_created := v_created + 1;
    ELSE
      -- Refresh knowledge fields — never null out existing values.
      UPDATE public.grammar_topics
      SET description = coalesce(v_desc, description),
          cefr        = coalesce(v_cefr::public.cefr_level, cefr),
          category    = coalesce(v_category, category),
          updated_at  = now()
      WHERE id = v_topic;
      v_updated := v_updated + 1;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_created, v_updated, v_errored;
END;
$$;

GRANT EXECUTE ON FUNCTION public.import_grammar_topics(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.import_grammar_topics(jsonb) TO service_role;

DROP FUNCTION IF EXISTS public.import_grammar_rules(jsonb);

CREATE OR REPLACE FUNCTION public.import_grammar_rules(
  p_rows jsonb
)
RETURNS TABLE(created int, updated int, errored int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item      jsonb;
  v_topic     uuid;
  v_rule      uuid;
  v_topic_txt text;
  v_title     text;
  v_rule_txt  text;
  v_expl      text;
  v_created   int := 0;
  v_updated   int := 0;
  v_errored   int := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can import grammar rules.';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_topic_txt := trim(coalesce(v_item->>'topic', ''));
    v_title     := trim(coalesce(v_item->>'title', ''));
    v_rule_txt  := trim(coalesce(v_item->>'rule', ''));
    IF v_topic_txt = '' OR v_title = '' OR v_rule_txt = '' THEN
      v_errored := v_errored + 1;
      CONTINUE;
    END IF;

    -- Topic must already exist (topic library is imported first — same
    -- flow as structures: knowledge precedes rules/exercises).
    SELECT id INTO v_topic
    FROM public.grammar_topics
    WHERE lower(trim(title)) = lower(v_topic_txt);
    IF v_topic IS NULL THEN
      v_errored := v_errored + 1;
      CONTINUE;
    END IF;

    v_expl := nullif(trim(coalesce(v_item->>'explanation', '')), '');

    -- Upsert-by-(topic, title) matching grammar_rules_topic_title_lower_key.
    SELECT id INTO v_rule
    FROM public.grammar_rules
    WHERE topic_id = v_topic
      AND lower(trim(title)) = lower(v_title);

    IF v_rule IS NULL THEN
      INSERT INTO public.grammar_rules (topic_id, title, rule, explanation)
      VALUES (v_topic, v_title, v_rule_txt, v_expl);
      v_created := v_created + 1;
    ELSE
      UPDATE public.grammar_rules
      SET rule        = v_rule_txt,
          explanation = coalesce(v_expl, explanation),
          updated_at  = now()
      WHERE id = v_rule;
      v_updated := v_updated + 1;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_created, v_updated, v_errored;
END;
$$;

GRANT EXECUTE ON FUNCTION public.import_grammar_rules(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.import_grammar_rules(jsonb) TO service_role;

-- import_grammar_exercises
--   Row shape: {topic?, rule, type, question, answer, options, explanation}
--   - `topic` is OPTIONAL: when present, the rule is scoped to that topic
--     (rule titles are unique per topic); when absent, the rule title must
--     resolve to EXACTLY ONE rule globally (0 or >1 match -> errored).
--   - Validation mirrors BOTH the client validator and the table CHECKs so a
--     rejected row never reaches the constraint (same as structures).
--   - Exercises are append-only shared content.
DROP FUNCTION IF EXISTS public.import_grammar_exercises(jsonb);

CREATE OR REPLACE FUNCTION public.import_grammar_exercises(
  p_rows jsonb
)
RETURNS TABLE(created int, errored int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item       jsonb;
  v_topic_txt  text;
  v_rule_txt   text;
  v_topic      uuid;
  v_rule       uuid;
  v_rule_count int := 0;
  v_type       text;
  v_question   text;
  v_answer     text;
  v_options    jsonb;
  v_expl       text;
  v_created    int := 0;
  v_errored    int := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can import grammar exercises.';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_topic_txt := trim(coalesce(v_item->>'topic', ''));
    v_rule_txt  := trim(coalesce(v_item->>'rule', ''));
    IF v_rule_txt = '' THEN
      v_errored := v_errored + 1;
      CONTINUE;
    END IF;

    IF v_topic_txt <> '' THEN
      SELECT id INTO v_topic
      FROM public.grammar_topics
      WHERE lower(trim(title)) = lower(v_topic_txt);
      IF v_topic IS NULL THEN
        v_errored := v_errored + 1;
        CONTINUE;
      END IF;

      SELECT id INTO v_rule
      FROM public.grammar_rules
      WHERE topic_id = v_topic
        AND lower(trim(title)) = lower(v_rule_txt);
      IF v_rule IS NULL THEN
        v_errored := v_errored + 1;
        CONTINUE;
      END IF;
    ELSE
      -- No topic hint: the rule title must be globally unambiguous.
      SELECT count(*) INTO v_rule_count
      FROM public.grammar_rules
      WHERE lower(trim(title)) = lower(v_rule_txt);
      IF v_rule_count <> 1 THEN
        v_errored := v_errored + 1;
        CONTINUE;
      END IF;

      SELECT id INTO v_rule
      FROM public.grammar_rules
      WHERE lower(trim(title)) = lower(v_rule_txt);
    END IF;

    v_type := lower(trim(coalesce(v_item->>'type', '')));
    IF v_type NOT IN ('multiple_choice', 'fill_blank', 'translation',
                      'correction', 'rearrange', 'production') THEN
      v_errored := v_errored + 1;
      CONTINUE;
    END IF;

    v_question := trim(coalesce(v_item->>'question', ''));
    IF v_question = '' THEN
      v_errored := v_errored + 1;
      CONTINUE;
    END IF;

    v_answer := trim(coalesce(v_item->>'answer', ''));
    IF v_type <> 'production' AND v_answer = '' THEN
      v_errored := v_errored + 1;
      CONTINUE;
    END IF;

    -- Options: coerce anything that is not a JSONB array to '[]'.
    v_options := v_item->'options';
    IF v_options IS NULL OR jsonb_typeof(v_options) <> 'array' THEN
      v_options := '[]'::jsonb;
    END IF;

    IF v_type = 'multiple_choice' AND jsonb_array_length(v_options) < 2 THEN
      v_errored := v_errored + 1;
      CONTINUE;
    END IF;

    v_expl := nullif(trim(coalesce(v_item->>'explanation', '')), '');

    INSERT INTO public.grammar_exercises
      (rule_id, type, question, answer, options, explanation)
    VALUES
      (v_rule, v_type, v_question, v_answer, v_options, v_expl);
    v_created := v_created + 1;
  END LOOP;

  RETURN QUERY SELECT v_created, v_errored;
END;
$$;

GRANT EXECUTE ON FUNCTION public.import_grammar_exercises(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.import_grammar_exercises(jsonb) TO service_role;

-- ------------------------------------------------------------
-- 7) Grants — follow the user_vocabulary / user_structures precedent:
--    table privileges are open to the standard roles; RLS does enforcement.
-- ------------------------------------------------------------
GRANT ALL ON public.grammar_topics TO anon, authenticated, service_role;
GRANT ALL ON public.grammar_rules TO anon, authenticated, service_role;
GRANT ALL ON public.grammar_exercises TO anon, authenticated, service_role;
GRANT ALL ON public.user_grammar TO anon, authenticated, service_role;

COMMIT;