-- ============================================================
-- FIX: Duplicate overload import_words -> PostgREST PGRST203 (HTTP 300).
--
-- ROOT CAUSE (confirmed live, 2026-09-01):
--   Canonical import_words (20260816110000_word_set_rpcs.sql):
--     import_words(p_words_data jsonb, p_set_id uuid DEFAULT NULL,
--                   p_new_set_name text DEFAULT NULL)
--   Stale overload (20260817000001_harden_import_words_rpc.sql):
--     import_words(p_set_id uuid, p_new_set_name text, p_words_data jsonb)
--
-- Because the two signatures differ, CREATE OR REPLACE in 20260817000001
-- created a SECOND overload instead of replacing. PostgREST then cannot
-- choose the best candidate when named params are used -> PGRST203
-- -> HTTP 300 -> UI 'Da xay ra loi. Vui long thu lai'.
--
-- FIX: drop BOTH overloads and recreate exactly ONE canonical function
-- with full type/CEFR normalization + validation (single source of truth).
-- ============================================================

-- 1) Drop both overloads.
DROP FUNCTION IF EXISTS public.import_words(jsonb, uuid, text);
DROP FUNCTION IF EXISTS public.import_words(uuid, text, jsonb);

-- 2) Recreate the canonical import_words (same validated body as 20260903000000).
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

        SELECT id INTO v_sense
        FROM public.word_senses
        WHERE word_id = v_word_id
          AND word_type = v_type::public.word_type
          AND regexp_replace(trim(lower(coalesce(v_meaning,''))),'\s+',' ','g') =
                regexp_replace(trim(lower(coalesce(v_meaning,''))),'\s+',' ','g');

        IF v_sense IS NULL THEN
            INSERT INTO public.word_senses (word_id, word_type, meaning, description, example)
            VALUES (v_word_id, v_type::public.word_type, v_meaning, v_descr, v_example)
            RETURNING id INTO v_sense;
            v_created := v_created + 1;
        ELSE
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
