-- ============================================================
-- Fix word_type enum: remove 'verb_phrase' (not a valid type).
--
-- ROOT CAUSE:
-- Migration 20260810200000 added 'verb_phrase' to the word_type
-- enum on the LIVE database. The canonical spec only allows 11
-- types — verb_phrase was removed from JS whitelist (VALID_WORD_TYPES)
-- but the DB enum still contains it. Users hitting "Đã xảy ra lỗi"
-- because the import_words RPC still maps phrase → verb_phrase.
--
-- PG cannot remove enum values; recreate the type + dependent funcs.
-- ============================================================

-- 1) Migrate existing word_senses with word_type = 'verb_phrase' -> 'other'
UPDATE public.word_senses
   SET word_type = 'other'::public.word_type
 WHERE word_type = 'verb_phrase'::public.word_type;

-- 2) Create new enum type (11 values, NO verb_phrase)
DROP TYPE IF EXISTS public.word_type_new;
CREATE TYPE public.word_type_new AS ENUM (
    'noun', 'verb', 'adjective', 'adverb', 'pronoun',
    'preposition', 'conjunction', 'determiner',
    'interjection', 'phrasal_verb', 'other'
);

-- 3) Drop dependent functions that reference the old type
DROP FUNCTION IF EXISTS public.get_words_in_set_with_progress(uuid, uuid);

-- 4) Swap the column type to the new enum
ALTER TABLE public.word_senses
    ALTER COLUMN word_type TYPE public.word_type_new
    USING word_type::text::public.word_type_new;

-- 5) Drop old enum, rename new one to word_type
ALTER TYPE public.word_type RENAME TO word_type_old;
DROP TYPE public.word_type_old;
ALTER TYPE public.word_type_new RENAME TO word_type;

-- 6) Re-create import_words RPC with corrected normalization
--    (all phrase/expression/collocation -> 'other', NOT verb_phrase)
DROP FUNCTION IF EXISTS public.import_words(jsonb, uuid, text);

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

-- 7) Re-create get_words_in_set_with_progress (dropped above before type swap)
CREATE OR REPLACE FUNCTION public.get_words_in_set_with_progress(
    p_set_id uuid,
    p_user_id uuid
)
RETURNS TABLE(
    id uuid,
    word_id uuid,
    word text,
    ipa text,
    cefr_level public.cefr_level,
    word_type public.word_type,
    meaning text,
    memory_clue text,
    example text,
    mastery_level int,
    review_due_at timestamptz,
    last_reviewed_at timestamptz,
    repetitions int,
    interval_hours int,
    ease_factor numeric,
    lapses int,
    state text,
    learning_step int,
    flashcard_reviews int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid      uuid    := auth.uid();
    v_allowed  boolean := false;
BEGIN
    IF auth.role() = 'service_role' THEN
        v_allowed := true;
    ELSIF v_uid IS NOT NULL THEN
        v_allowed :=
            coalesce(
                (SELECT (users.role = 'admin'::public.user_role)
                   FROM public.users
                  WHERE users.id = v_uid),
                false
            )
            OR EXISTS (
                SELECT 1
                FROM public.vocabulary_sets
                WHERE vocabulary_sets.id = p_set_id
                  AND vocabulary_sets.user_id = v_uid
            );
    END IF;

    IF NOT v_allowed THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        ws.id,
        w.id AS word_id,
        w.word,
        w.ipa,
        w.cefr_level,
        ws.word_type,
        ws.meaning,
        ws.description AS memory_clue,
        ws.example,
        up.mastery_level,
        up.review_due_at,
        up.last_reviewed_at,
        up.repetitions,
        up.interval_hours,
        up.ease_factor,
        up.lapses,
        up.state,
        up.learning_step,
        up.flashcard_reviews
    FROM public.set_words sw
    JOIN public.word_senses ws  ON sw.word_sense_id = ws.id
    JOIN public.words w         ON ws.word_id = w.id
    LEFT JOIN public.user_progress up
           ON up.word_sense_id = ws.id
          AND up.user_id = p_user_id
    WHERE sw.set_id = p_set_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_words_in_set_with_progress(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_words_in_set_with_progress(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_words_in_set_with_progress(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_words_in_set_with_progress(uuid, uuid) TO service_role;
NOTIFY pgrst, 'reload schema';

-- Grant execute on import_words
GRANT EXECUTE ON FUNCTION public.import_words(jsonb, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.import_words(jsonb, uuid, text) TO service_role;
