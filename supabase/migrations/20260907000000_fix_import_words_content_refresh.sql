-- =====================================================================
-- ROOT-CAUSE FIX: import_words reuses existing senses without refreshing
-- description/example, and a self-comparison typo broke canonical matching.
--
-- BUG (reported via `architecture` keeping old content):
--   Re-importing a word that already has a word_sense kept the OLD
--   description/example. Root cause is in the import write-path RPC:
--
--   1) 20260903000000 / 20260904000000 introduced a regression in the
--      canonical sense lookup. The meaning comparison was written as
--        coalesce(v_meaning) = coalesce(v_meaning)     -- ALWAYS TRUE
--      instead of the correct
--        coalesce(meaning)   = coalesce(v_meaning)     -- column vs input
--      This made the lookup match by (word_id, word_type) ONLY, ignoring
--      meaning entirely (could attach a user to the WRONG sense, or reuse
--      a sense whose meaning differs).
--
--   2) Independently, import_words NEVER updates an existing sense's
--      description/example — it only counts it as "existing" and moves on.
--      So a corrected re-import with the same (word, type, meaning) could
--      never refresh content. Content could only change via the EDIT RPCs
--      (update_user_word / admin_update_word).
--
-- FIX (minimal, no duplicate sense, no SRS/user_progress/set_words change):
--   * Restore the correct meaning-column comparison so canonical identity
--     is (word_id, word_type, normalize(meaning)).
--   * When an existing canonical sense IS matched, refresh its
--     description/example from the imported payload when the new values
--     differ (NULL-safe). Empty imports do NOT clobber.
--   * Keeps the existing "reuse, don't duplicate" ownership/link behavior.
--
-- Idempotent (DROP + CREATE OR REPLACE). No data rows are changed here.
-- =====================================================================

-- 1) Drop BOTH historical overloads so exactly one canonical function exists.
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
        v_word := trim(coalesce(v_item->>'word', ''));
        IF v_word = '' THEN v_errored := v_errored + 1; CONTINUE; END IF;

        v_ipa    := nullif(trim(coalesce(v_item->>'ipa','')),'');
        v_cefr   := nullif(upper(trim(coalesce(v_item->>'cefr',''))),'');
        v_type   := lower(coalesce(nullif(trim(coalesce(v_item->>'word_type','')),''),'other'));
        v_meaning := trim(coalesce(v_item->>'meaning',''));
        v_example := nullif(trim(coalesce(v_item->>'example','')),'');
        v_descr   := nullif(trim(coalesce(v_item->>'memory_clue', v_item->>'description','')),'');

        -- verb_phrase KHONG con la Type hop le - moi phrase -> other
        v_type := CASE v_type
            WHEN 'phrasal verb'  THEN 'phrasal_verb'
            WHEN 'phrasal-verb'  THEN 'phrasal_verb'
            WHEN 'phrasalverb'   THEN 'phrasal_verb'
            WHEN 'phrasal verbs' THEN 'phrasal_verb'
            WHEN 'verb phrase'   THEN 'other'
            WHEN 'verb-phrase'   THEN 'other'
            WHEN 'verbphrase'    THEN 'other'
            WHEN 'verb phrases'  THEN 'other'
            WHEN 'noun phrase'   THEN 'other'
            WHEN 'noun_phrase'   THEN 'other'
            WHEN 'adjective phrase' THEN 'other'
            WHEN 'adverb phrase'   THEN 'other'
            WHEN 'prepositional phrase' THEN 'other'
            WHEN 'phrase'        THEN 'other'
            WHEN 'phrases'       THEN 'other'
            WHEN 'expression'     THEN 'other'
            WHEN 'expressions'   THEN 'other'
            WHEN 'collocation'   THEN 'other'
            WHEN 'collocations'  THEN 'other'
            WHEN 'v.' THEN 'verb'
            WHEN 'n.' THEN 'noun'
            WHEN 'adj.' THEN 'adjective'
            WHEN 'adv.' THEN 'adverb'
            WHEN 'prep.' THEN 'preposition'
            WHEN 'conj.' THEN 'conjunction'
            WHEN 'pron.' THEN 'pronoun'
            ELSE v_type
        END;

        -- Only 11 valid types; verb_phrase is NOT among them.
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
        -- FIX: compare the `meaning` COLUMN against the imported v_meaning
        -- (previous versions compared v_meaning to itself -> always true).
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
            v_created := v_created + 1;
        ELSE
            -- Refresh content ONLY when a non-empty imported value actually
            -- differs (v_descr/v_example are NULL for empty strings, so
            -- coalesce keeps the existing value). Never clobber with empty
            -- strings; never create a duplicate sense.
            UPDATE public.word_senses
            SET description = coalesce(v_descr, description),
                example     = coalesce(v_example, example)
            WHERE id = v_sense
              AND (description IS DISTINCT FROM coalesce(v_descr, description)
                   OR example IS DISTINCT FROM coalesce(v_example, example));
            v_existing := v_existing + 1;
        END IF;

        INSERT INTO public.user_vocabulary (user_id, word_sense_id)
        VALUES (v_user, v_sense)
        ON CONFLICT DO NOTHING;

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