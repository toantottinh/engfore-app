-- Harden import_words_to_set:
-- Normalize and validate word_type / cefr before casting to PostgreSQL enums.

DROP FUNCTION IF EXISTS public.import_words_to_set(uuid, jsonb);

CREATE OR REPLACE FUNCTION public.import_words_to_set(
    p_set_id uuid,
    p_words_data jsonb
)
RETURNS TABLE(imported int, errored int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id   uuid;
    v_word_id   uuid;
    v_sense_id  uuid;
    v_item      jsonb;
    v_word      text;
    v_ipa       text;
    v_cefr      text;
    v_type      text;
    v_meaning   text;
    v_example   text;
    v_descr     text;
    v_imported  int := 0;
    v_errored   int := 0;
BEGIN
    -- 1) Phải đăng nhập
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Bạn cần đăng nhập để nhập từ.';
    END IF;

    -- 2) Chỉ được nhập vào set thuộc về chính mình
    IF NOT EXISTS (
        SELECT 1
        FROM public.vocabulary_sets
        WHERE id = p_set_id
          AND user_id = v_user_id
    ) THEN
        RAISE EXCEPTION 'Bạn không có quyền nhập từ vào bộ từ này.';
    END IF;

    -- 3) Duyệt từng từ
    FOR v_item IN
        SELECT *
        FROM jsonb_array_elements(p_words_data)
    LOOP
        v_word := trim(coalesce(v_item->>'word', ''));

        IF v_word = '' THEN
            v_errored := v_errored + 1;
            CONTINUE;
        END IF;

        v_ipa := nullif(
            trim(coalesce(v_item->>'ipa', '')),
            ''
        );

        v_cefr := nullif(
            upper(trim(coalesce(v_item->>'cefr', ''))),
            ''
        );

        v_type := lower(
            coalesce(
                nullif(
                    trim(coalesce(v_item->>'word_type', '')),
                    ''
                ),
                'other'
            )
        );

        -- 3a) Chuẩn hóa word_type
        v_type := CASE v_type
            WHEN 'phrasal verb' THEN 'phrasal_verb'
            WHEN 'phrasal-verb' THEN 'phrasal_verb'
            WHEN 'phrasalverb' THEN 'phrasal_verb'
            WHEN 'phrasal verbs' THEN 'phrasal_verb'

            WHEN 'verb phrase' THEN 'verb_phrase'
            WHEN 'verb-phrase' THEN 'verb_phrase'
            WHEN 'verbphrase' THEN 'verb_phrase'
            WHEN 'verb phrases' THEN 'verb_phrase'

            WHEN 'v.' THEN 'verb'
            WHEN 'n.' THEN 'noun'
            WHEN 'adj.' THEN 'adjective'
            WHEN 'adv.' THEN 'adverb'
            WHEN 'prep.' THEN 'preposition'
            WHEN 'conj.' THEN 'conjunction'
            WHEN 'pron.' THEN 'pronoun'

            ELSE v_type
        END;

        -- 3b) Validate word_type trước khi cast enum
        IF v_type NOT IN (
            'noun',
            'verb',
            'adjective',
            'adverb',
            'preposition',
            'conjunction',
            'pronoun',
            'other',
            'determiner',
            'interjection',
            'phrasal_verb',
            'verb_phrase'
        ) THEN
            RAISE EXCEPTION 'Loại từ không hợp lệ: %', v_type;
        END IF;

        -- 3c) Validate CEFR trước khi cast enum
        IF v_cefr IS NOT NULL
           AND v_cefr NOT IN (
               'A1',
               'A2',
               'B1',
               'B2',
               'C1',
               'C2'
           )
        THEN
            RAISE EXCEPTION 'CEFR không hợp lệ: %', v_cefr;
        END IF;

        v_meaning := trim(
            coalesce(v_item->>'meaning', '')
        );

        v_example := nullif(
            trim(coalesce(v_item->>'example', '')),
            ''
        );

        v_descr := nullif(
            trim(coalesce(v_item->>'description', '')),
            ''
        );

        -- 3d) Tái sử dụng word nếu đã tồn tại trong từ điển chung
        SELECT id
        INTO v_word_id
        FROM public.words
        WHERE word = v_word;

        IF v_word_id IS NULL THEN
            IF v_cefr IS NOT NULL THEN
                INSERT INTO public.words (
                    word,
                    ipa,
                    cefr_level
                )
                VALUES (
                    v_word,
                    v_ipa,
                    v_cefr::public.cefr_level
                )
                ON CONFLICT (word) DO NOTHING
                RETURNING id INTO v_word_id;
            ELSE
                INSERT INTO public.words (
                    word,
                    ipa
                )
                VALUES (
                    v_word,
                    v_ipa
                )
                ON CONFLICT (word) DO NOTHING
                RETURNING id INTO v_word_id;
            END IF;

            IF v_word_id IS NULL THEN
                SELECT id
                INTO v_word_id
                FROM public.words
                WHERE word = v_word;
            END IF;
        END IF;

        -- 3e) Tạo nghĩa mới
        INSERT INTO public.word_senses (
            word_id,
            word_type,
            meaning,
            description,
            example
        )
        VALUES (
            v_word_id,
            v_type::public.word_type,
            v_meaning,
            v_descr,
            v_example
        )
        RETURNING id INTO v_sense_id;

        -- 3f) Liên kết vào set
        INSERT INTO public.set_words (
            set_id,
            word_sense_id
        )
        VALUES (
            p_set_id,
            v_sense_id
        )
        ON CONFLICT (set_id, word_sense_id) DO NOTHING;

        v_imported := v_imported + 1;
    END LOOP;

    RETURN QUERY
    SELECT v_imported, v_errored;
END;
$$;

GRANT EXECUTE
ON FUNCTION public.import_words_to_set(uuid, jsonb)
TO authenticated;

GRANT EXECUTE
ON FUNCTION public.import_words_to_set(uuid, jsonb)
TO service_role;
