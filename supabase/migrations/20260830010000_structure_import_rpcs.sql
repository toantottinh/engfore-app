-- ============================================================
-- EngFore — Sentence Structures v1 — Admin Import RPCs
--
-- Mirrors the established RPC conventions:
--   * SECURITY DEFINER SET search_path = public (like import_words /
--     admin_import_words) so RLS-protected content tables can be written
--     through a validated, privilege-checked entry point.
--   * Admin-only via public.is_admin() (migration 20260818100000).
--   * Server-side normalization + validation per row; bad rows are counted
--     in `errored` and skipped, mirroring import_words behavior.
--   * NO SRS state is imported — user_structures is created/managed per
--     user by the learning flow, never from content imports.
--
-- Semantics:
--   import_structures          : upsert-by-pattern (case-insensitive, trimmed).
--                                 New pattern -> INSERT (+ examples).
--                                 Existing    -> refresh knowledge fields
--                                 (meaning/explanation/cefr/topic, never nulls out)
--                                 and REPLACE examples ONLY when the row carries an
--                                 `examples` JSONB array (deterministic full-sync).
--   import_structure_exercises : resolve structure by pattern; validate type/
--                                 question/answer/options; INSERT exercise rows.
--                                 Exercises are append-only shared content
--                                 (duplicates are allowed at DB level — client
--                                 validator warns on them during preview).
-- ============================================================

DROP FUNCTION IF EXISTS public.import_structures(jsonb);

CREATE OR REPLACE FUNCTION public.import_structures(
  p_rows jsonb
)
RETURNS TABLE(created int, updated int, errored int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item        jsonb;
  v_example     jsonb;
  v_structure   uuid;
  v_pattern     text;
  v_meaning     text;
  v_explanation text;
  v_cefr        text;
  v_topic       text;
  v_sentence    text;
  v_translation text;
  v_created     int := 0;
  v_updated     int := 0;
  v_errored     int := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can import structures.';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    -- Normalize required fields.
    v_pattern := trim(coalesce(v_item->>'pattern', ''));
    v_meaning := trim(coalesce(v_item->>'meaning', ''));
    IF v_pattern = '' OR v_meaning = '' THEN
      v_errored := v_errored + 1;
      CONTINUE;
    END IF;

    -- CEFR: optional, but must be a valid level when present (strict,
    -- same rule as import_words) to avoid enum cast failures.
    v_cefr := nullif(upper(trim(coalesce(v_item->>'cefr', ''))), '');
    IF v_cefr IS NOT NULL AND v_cefr NOT IN ('A1','A2','B1','B2','C1','C2') THEN
      v_errored := v_errored + 1;
      CONTINUE;
    END IF;

    v_explanation := nullif(trim(coalesce(v_item->>'explanation', '')), '');
    v_topic       := nullif(trim(coalesce(v_item->>'topic', '')), '');

    -- Upsert-by-pattern, matching the unique functional index
    -- structures_pattern_lower_key ON lower(trim(pattern)).
    SELECT id INTO v_structure
    FROM public.structures
    WHERE lower(trim(pattern)) = lower(v_pattern);

    IF v_structure IS NULL THEN
      INSERT INTO public.structures (pattern, meaning, explanation, cefr, topic)
      VALUES (v_pattern, v_meaning, v_explanation, v_cefr::public.cefr_level, v_topic)
      RETURNING id INTO v_structure;
      v_created := v_created + 1;
    ELSE
      UPDATE public.structures
      SET meaning     = v_meaning,
          explanation = COALESCE(v_explanation, explanation),
          cefr        = COALESCE(v_cefr::public.cefr_level, cefr),
          topic       = COALESCE(v_topic, topic)
      WHERE id = v_structure;
      v_updated := v_updated + 1;
    END IF;

    -- Examples: full-replace ONLY when this row explicitly provides an
    -- `examples` array. Rows without it leave existing examples untouched.
    IF v_item ? 'examples' AND jsonb_typeof(v_item->'examples') = 'array' THEN
      DELETE FROM public.structure_examples WHERE structure_id = v_structure;

      FOR v_example IN SELECT * FROM jsonb_array_elements(v_item->'examples') LOOP
        v_sentence := trim(coalesce(v_example->>'sentence', ''));
        IF v_sentence = '' THEN CONTINUE; END IF; -- drop malformed example silently
        v_translation := nullif(trim(coalesce(v_example->>'translation', '')), '');
        INSERT INTO public.structure_examples (structure_id, sentence, translation)
        VALUES (v_structure, v_sentence, v_translation);
      END LOOP;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_created, v_updated, v_errored;
END;
$$;

GRANT EXECUTE ON FUNCTION public.import_structures(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.import_structures(jsonb) TO service_role;

-- ------------------------------------------------------------
-- 2) import_structure_exercises
--    Row shape: {pattern, type, question, answer, options[], explanation}
--    Validation mirrors BOTH the client validator and the table CHECKs so
--    a rejected row never reaches the constraint:
--      * pattern must resolve to an existing structure
--      * type must be one of the 6 V1 types
--      * question required (all types)
--      * answer required for deterministic types, optional for production
--      * options normalized to a JSONB array; multiple_choice needs >= 2
--    Production rows are stored like any other row but are NEVER treated as
--    deterministically gradeable by the app (answer = target/example only).
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.import_structure_exercises(jsonb);

CREATE OR REPLACE FUNCTION public.import_structure_exercises(
  p_rows jsonb
)
RETURNS TABLE(created int, errored int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item        jsonb;
  v_structure   uuid;
  v_pattern     text;
  v_type        text;
  v_question    text;
  v_answer      text;
  v_options     jsonb;
  v_explanation text;
  v_created     int := 0;
  v_errored     int := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can import structure exercises.';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_pattern := trim(coalesce(v_item->>'pattern', ''));
    IF v_pattern = '' THEN
      v_errored := v_errored + 1;
      CONTINUE;
    END IF;

    -- Structure must already exist (Knowledge import runs first).
    SELECT id INTO v_structure
    FROM public.structures
    WHERE lower(trim(pattern)) = lower(v_pattern);
    IF v_structure IS NULL THEN
      v_errored := v_errored + 1;
      CONTINUE;
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

    v_explanation := nullif(trim(coalesce(v_item->>'explanation', '')), '');

    INSERT INTO public.structure_exercises
      (structure_id, type, question, answer, options, explanation)
    VALUES
      (v_structure, v_type, v_question, v_answer, v_options, v_explanation);
    v_created := v_created + 1;
  END LOOP;

  RETURN QUERY SELECT v_created, v_errored;
END;
$$;

GRANT EXECUTE ON FUNCTION public.import_structure_exercises(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.import_structure_exercises(jsonb) TO service_role;