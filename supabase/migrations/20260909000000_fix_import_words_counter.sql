-- =====================================================================
-- COUNTER FIX: import_words `created/existing` must reflect the CURRENT
-- USER's Vocabulary, not whether the canonical global word_sense exists.
--
-- ROOT-CAUSE (verified):
--   In 20260907000000 the counter was tied to the global word_sense lookup:
--     IF v_sense IS NULL  -> v_created  := v_created  + 1   (global NEW)
--     ELSE                -> v_existing := v_existing + 1   (global EXISTING)
--   So a word whose canonical sense already lives in word_senses was always
--   reported "existing" for the user, even when the user had NEVER owned it
--   (user_vocabulary had no row). Result: after deleting a Set/Vocabulary the
--   UI says "X tu da co (gop vao kho)" while user_vocabulary has 0 rows.
--
-- FIX (semantic only  -- global sense architecture is preserved):
--   NEW     = current user has NO row in user_vocabulary for this sense.
--   EXISTING= current user ALREADY owns a row in user_vocabulary for it.
--   The global word_sense lookup only decides whether to CREATE or REUSE the
--   canonical sense -- it NO LONGER drives the counter.
--
-- Out of scope (unchanged, intact):
--   * words / word_senses global architecture and identity.
--   * user_progress (SRS): never read, never written, never reset.
--   * set_words linking (ON CONFLICT DO NOTHING).
--   * RPC signature & return shape.
-- Idempotent (CREATE OR REPLACE + ADD COLUMN IF NOT EXISTS).
-- =====================================================================

-- 1) User-owned content columns on the ownership table (idempotent).
ALTER TABLE public.user_vocabulary
  ADD COLUMN IF NOT EXISTS example text;
ALTER TABLE public.user_vocabulary
  ADD COLUMN IF NOT EXISTS memory_clue text;

-- 2) Drop both historical overloads so exactly one canonical function exists.
DROP FUNCTION IF EXISTS public.import_words(jsonb, uuid, text);
DROP FUNCTION IF EXISTS public.import_words(uuid, text, jsonb);


CREATE OR REPLACE FUNCTION public.import_words(
    p_words_data jsonb,
    p_set_id uuid DEFAULT NULL,
    p_new_set_name text DEFAULT NULL
)
RETURNS TABLE(created int, existing int, linked int, errored int, set_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user   uuid := auth.uid();
    v_set    uuid := p_set_id;
    v_item   jsonb;
    v_word   text;
    v_ipa    text;
    v_cefr   text;
    v_type   text;
    v_meaning text;
    v_example text;
    v_descr  text;
    v_word_id uuid;
    v_sense  uuid;
    v_user_owns boolean;
    v_created  int := 0;
    v_existing int := 0;
    v_linked   int := 0;
    v_errored  int := 0;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'Ban can dang nhap.';
    END IF;

    IF v_set IS NULL AND p_new_set_name IS NOT NULL AND trim(p_new_set_name) <> '' THEN
        INSERT INTO public.vocabulary_sets (user_id, name)
        VALUES (v_user, trim(p_new_set_name))
        RETURNING id INTO v_set;
    END IF;

    IF v_set IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.vocabulary_sets WHERE id = v_set AND user_id = v_user
    ) THEN
        RAISE EXCEPTION 'Ban khong co quyen nhap vao bo tu nay.';
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_words_data) LOOP
        v_word := public.strip_embedded_word_type(coalesce(v_item->>'word', ''));
        IF v_word = '' THEN v_errored := v_errored + 1; CONTINUE; END IF;

        v_ipa    := nullif(trim(coalesce(v_item->>'ipa','')),'');
        v_cefr   := nullif(upper(trim(coalesce(v_item->>'cefr',''))),'');
        v_type   := lower(coalesce(nullif(trim(coalesce(v_item->>'word_type','')),''),'other'));
        v_meaning := trim(coalesce(v_item->>'meaning',''));
        v_example := nullif(trim(coalesce(v_item->>'example','')),'');
        v_descr   := nullif(trim(coalesce(v_item->>'memory_clue', v_item->>'description','')),'');

        v_type := CASE v_type
            WHEN 'phrasal verb' THEN 'phrasal_verb'
            WHEN 'v.' THEN 'verb'
            WHEN 'n.' THEN 'noun'
            WHEN 'adj.' THEN 'adjective'
            WHEN 'adv.' THEN 'adverb'
            WHEN 'prep.' THEN 'preposition'
            WHEN 'conj.' THEN 'conjunction'
            WHEN 'pron.' THEN 'pronoun'
            ELSE v_type
        END;

        IF v_type NOT IN ('noun','verb','adjective','adverb','preposition','conjunction',
                          'pronoun','other','determiner','interjection','phrasal_verb') THEN
            v_errored := v_errored + 1; CONTINUE;
        END IF;
        IF v_cefr IS NOT NULL AND v_cefr NOT IN ('A1','A2','B1','B2','C1','C2') THEN
            v_errored := v_errored + 1; CONTINUE;
        END IF;

        SELECT id INTO v_word_id FROM public.words WHERE lower(word) = lower(v_word);

        IF v_word_id IS NULL THEN
            IF v_cefr IS NOT NULL THEN
                INSERT INTO public.words (word, ipa, cefr_level)
                VALUES (v_word, v_ipa, v_cefr::public.cefr_level)
                ON CONFLICT (word) DO NOTHING
                RETURNING id INTO v_word_id;
            ELSE
                INSERT INTO public.words (word, ipa)
                VALUES (v_word, v_ipa)
                ON CONFLICT (word) DO NOTHING
                RETURNING id INTO v_word_id;
            END IF;
            IF v_word_id IS NULL THEN
                SELECT id INTO v_word_id FROM public.words WHERE word = v_word;
            END IF;
        END IF;

        -- Canonical identity = (word_id, word_type, normalize(meaning)).
        SELECT id INTO v_sense
        FROM public.word_senses
        WHERE word_id = v_word_id
          AND word_type = v_type::public.word_type
          AND regexp_replace(trim(lower(coalesce(meaning,''))),'\s+',' ','g') =
                regexp_replace(trim(lower(coalesce(v_meaning,''))),'\s+',' ','g');

        IF v_sense IS NULL THEN
            INSERT INTO public.word_senses (word_id, word_type, meaning, description, example)
            VALUES (v_word_id, v_type::public.word_type, v_meaning, v_descr, v_example)
            RETURNING id INTO v_sense;
        ELSE
            UPDATE public.word_senses
            SET description = coalesce(v_descr, description),
                example     = coalesce(v_example, example)
            WHERE id = v_sense
              AND (description IS DISTINCT FROM coalesce(v_descr, description)
                   OR example IS DISTINCT FROM coalesce(v_example, example));
        END IF;

        -- COUNTER FIX: decide NEW vs EXISTING from the CURRENT USER's
        -- ownership (user_vocabulary), NOT from the global word_sense existence.
        --   NEW     = user has no user_vocabulary row for this sense yet.
        --   EXISTING= user already has a user_vocabulary row for this sense.
        SELECT EXISTS (
            SELECT 1
            FROM public.user_vocabulary
            WHERE user_id = v_user AND word_sense_id = v_sense
        ) INTO v_user_owns;

        IF v_user_owns THEN
            v_existing := v_existing + 1;
        ELSE
            v_created := v_created + 1;
        END IF;

        -- Idempotent upsert of the user-owned row. Stores the imported
        -- example/memory_clue on the user's ownership row; empty imports do
        -- not clobber existing user content (NULL-safe via coalesce).
        INSERT INTO public.user_vocabulary (user_id, word_sense_id, example, memory_clue)
        VALUES (v_user, v_sense, v_example, v_descr)
        ON CONFLICT (user_id, word_sense_id) DO UPDATE
            SET example     = coalesce(EXCLUDED.example,     public.user_vocabulary.example),
                memory_clue = coalesce(EXCLUDED.memory_clue, public.user_vocabulary.memory_clue);

        IF v_set IS NOT NULL THEN
            INSERT INTO public.set_words (set_id, word_sense_id)
            VALUES (v_set, v_sense)
            ON CONFLICT DO NOTHING;
            v_linked := v_linked + 1;
        END IF;
    END LOOP;

    RETURN QUERY SELECT v_created, v_existing, v_linked, v_errored, v_set;
END;
$$;

GRANT EXECUTE ON FUNCTION public.import_words(jsonb, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.import_words(jsonb, uuid, text) TO service_role;
NOTIFY pgrst, 'reload schema';

