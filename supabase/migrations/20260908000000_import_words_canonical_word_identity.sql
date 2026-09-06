-- =====================================================================
-- Canonical word identity for imports (data-cleanup follow-up).
--
-- AUDIT CONTEXT (2026-09, read-only audit via audit-legacy-clues.mjs):
--   * Live DB contains a duplicate `words` group created by legacy
--     imports that EMBEDDED the word type into the word name:
--         `average`     (canonical, modern description)
--         `average(adj)` (legacy, description "average → ở mức trung bình")
--         `average(n)`   (legacy, description "average → mức trung bình")
--   * Root cause: every import RPC used p_word verbatim as the canonical
--     word identity. An input row `average(adj) | ... | adjective` created
--     a NEW words row literally named `average(adj)` instead of resolving
--     to the canonical `average` word with word_type=adjective.
--
-- FIX (identity only — word_senses reuse/refresh behavior is preserved):
--   * New shared helper public.strip_embedded_word_type(text): removes a
--     trailing embedded type marker — `average(adj)` -> `average`,
--     `average (n)` -> `average` — WITHOUT touching the rest of the name
--     (phrases like `age limit` or real parentheses content are kept).
--   * All three import write-paths normalize the word name BEFORE the
--     words lookup/insert:
--       - public.import_words        (user import RPC)
--       - public.admin_import_words  (admin/public-set import RPC)
--       - public.import_words_to_set (add/import into an owned set)
--   * Word type stays where it belongs: the word_senses.word_type column.
--
-- NO DATA ROWS are changed by this migration. The existing duplicate
-- rows are NOT deleted (they may be referenced by user data); cleanup is
-- a separate, ownership-safe, conditional step (see supabase/audit/).
-- Idempotent: DROP + CREATE OR REPLACE.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Shared helper: canonical English word from an import payload word.
--    Only a TRAILING parenthesized type marker is stripped, and only
--    when something remains (never returns a non-empty -> empty strip
--    for a marker-only input; that returns '' so callers count an error).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.strip_embedded_word_type(p_word text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
    v          text := btrim(coalesce(p_word, ''));
    v_stripped text;
BEGIN
    LOOP
        v_stripped := btrim(regexp_replace(
            v,
            '\s*\((adj|n|v|verb|noun|adjective|adverb|adv|prep|preposition|conj|conjunction|pron|pronoun|interj|interjection|det|determiner|phrase|phrasal_verb|phrasal verb|expression)\)\s*$',
            '',
            'i'
        ));
        v_stripped := btrim(regexp_replace(v_stripped, '\s+', ' ', 'g'));
        -- Marker-only input ("(adj)") -> empty, let the caller error out.
        IF v_stripped = '' THEN
            RETURN '';
        END IF;
        -- No further trailing marker -> done.
        IF v_stripped = v THEN
            EXIT;
        END IF;
        v := v_stripped;
    END LOOP;
    RETURN v;
END;
$$;

-- ---------------------------------------------------------------------
-- 2) import_words — canonical user import RPC (20260907000000 body),
--    + word-name normalization BEFORE the words lookup/insert.
-- ---------------------------------------------------------------------
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
        -- CANONICAL IDENTITY FIX: never let an embedded type marker
        -- (`average(adj)`, `average (n)`) become a words row.
        v_word := public.strip_embedded_word_type(v_word);

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
            -- differs (NULL-safe). Empty imports do NOT clobber.
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


-- ---------------------------------------------------------------------
-- 3) admin_import_words — same identity fix (import vào public set).
--    NOTE: this variant previously had NEITHER the 20260907000000
--    content-refresh nor any word-name normalization; it is recreated
--    here with normalization. Content refresh for the admin path is NOT
--    changed (out of scope, behavior preserved).
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_import_words(jsonb, uuid, text, uuid, content_status);

CREATE OR REPLACE FUNCTION public.admin_import_words(
  p_words_data jsonb,
  p_set_id uuid DEFAULT NULL,
  p_new_set_name text DEFAULT NULL,
  p_new_set_topic_id uuid DEFAULT NULL,
  p_new_set_status content_status DEFAULT 'draft'
)
RETURNS TABLE(created int, existing int, linked int, errored int, set_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
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
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can import to public sets.';
  END IF;

  IF v_set IS NULL AND p_new_set_name IS NOT NULL AND trim(p_new_set_name) <> '' THEN
    INSERT INTO public.vocabulary_sets (user_id, name, topic_id, status)
    VALUES (NULL, trim(p_new_set_name), p_new_set_topic_id, p_new_set_status)
    RETURNING id INTO v_set;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_words_data) LOOP
    v_word := trim(coalesce(v_item->>'word', ''));
    -- CANONICAL IDENTITY FIX (same as import_words).
    v_word := public.strip_embedded_word_type(v_word);
    IF v_word = '' THEN v_errored := v_errored + 1; CONTINUE; END IF;

    v_ipa    := nullif(trim(coalesce(v_item->>'ipa','')),'');
    v_cefr   := nullif(upper(trim(coalesce(v_item->>'cefr',''))),'');
    v_type   := lower(coalesce(nullif(trim(coalesce(v_item->>'word_type','')),''),'other'));
    v_meaning := trim(coalesce(v_item->>'meaning',''));
    v_example := nullif(trim(coalesce(v_item->>'example','')),'');
    v_descr   := nullif(trim(coalesce(v_item->>'memory_clue', v_item->>'description','')),'');

    v_type := CASE v_type
      WHEN 'phrasal verb' THEN 'phrasal_verb' WHEN 'v.' THEN 'verb'
      WHEN 'n.' THEN 'noun' WHEN 'adj.' THEN 'adjective'
      WHEN 'adv.' THEN 'adverb' ELSE v_type
    END;

    IF v_type NOT IN (SELECT unnest(enum_range(NULL::word_type))::text) THEN
      v_errored := v_errored + 1; CONTINUE;
    END IF;
    IF v_cefr IS NOT NULL AND v_cefr NOT IN ('A1','A2','B1','B2','C1','C2') THEN
      v_errored := v_errored + 1; CONTINUE;
    END IF;

    SELECT id INTO v_word_id FROM public.words WHERE lower(word) = lower(v_word);
    IF v_word_id IS NULL THEN
      INSERT INTO public.words (word, ipa, cefr_level)
      VALUES (v_word, v_ipa, v_cefr::public.cefr_level)
      ON CONFLICT (lower(word)) DO NOTHING
      RETURNING id INTO v_word_id;
      IF v_word_id IS NULL THEN
        SELECT id INTO v_word_id FROM public.words WHERE lower(word) = lower(v_word);
      END IF;
    END IF;

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
      v_existing := v_existing + 1;
    END IF;

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

GRANT EXECUTE ON FUNCTION public.admin_import_words(jsonb, uuid, text, uuid, content_status) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_import_words(jsonb, uuid, text, uuid, content_status) TO service_role;


-- ---------------------------------------------------------------------
-- 4) import_words_to_set — add/import into an OWNED set (same identity
--    fix; everything else in the 20260811000000 body is preserved).
-- ---------------------------------------------------------------------
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
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Bạn cần đăng nhập để nhập từ.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.vocabulary_sets
        WHERE id = p_set_id
          AND user_id = v_user_id
    ) THEN
        RAISE EXCEPTION 'Bạn không có quyền nhập từ vào bộ từ này.';
    END IF;

    FOR v_item IN
        SELECT *
        FROM jsonb_array_elements(p_words_data)
    LOOP
        v_word := trim(coalesce(v_item->>'word', ''));
        -- CANONICAL IDENTITY FIX (same as import_words).
        v_word := public.strip_embedded_word_type(v_word);

        IF v_word = '' THEN
            v_errored := v_errored + 1;
            CONTINUE;
        END IF;

        v_ipa := nullif(trim(coalesce(v_item->>'ipa', '')), '');
        v_cefr := nullif(upper(trim(coalesce(v_item->>'cefr', ''))), '');
        v_type := lower(coalesce(nullif(trim(coalesce(v_item->>'word_type', '')),''), 'other'));

        -- 3a) Chuẩn hóa word_type
        v_type := CASE v_type
            WHEN 'phrasal verb' THEN 'phrasal_verb'
            WHEN 'phrasal-verb' THEN 'phrasal_verb'
            WHEN 'phrasalverb' THEN 'phrasal_verb'
            WHEN 'phrasal verbs' THEN 'phrasal_verb'
            WHEN 'verb phrase' THEN 'other'
            WHEN 'verb-phrase' THEN 'other'
            WHEN 'verbphrase' THEN 'other'
            WHEN 'verb phrases' THEN 'other'
            WHEN 'noun phrase' THEN 'other'
            WHEN 'noun_phrase' THEN 'other'
            WHEN 'adjective phrase' THEN 'other'
            WHEN 'adverb phrase' THEN 'other'
            WHEN 'prepositional phrase' THEN 'other'
            WHEN 'phrase' THEN 'other'
            WHEN 'phrases' THEN 'other'
            WHEN 'expression' THEN 'other'
            WHEN 'expressions' THEN 'other'
            WHEN 'collocation' THEN 'other'
            WHEN 'collocations' THEN 'other'
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
            'noun', 'verb', 'adjective', 'adverb', 'preposition',
            'conjunction', 'pronoun', 'other', 'determiner',
            'interjection', 'phrasal_verb'
        ) THEN
            RAISE EXCEPTION 'Loại từ không hợp lệ: %', v_type;
        END IF;

        -- 3c) Validate CEFR trước khi cast enum
        IF v_cefr IS NOT NULL
           AND v_cefr NOT IN ('A1','A2','B1','B2','C1','C2')
        THEN
            RAISE EXCEPTION 'CEFR không hợp lệ: %', v_cefr;
        END IF;

        v_meaning := trim(coalesce(v_item->>'meaning', ''));
        v_example := nullif(trim(coalesce(v_item->>'example', '')), '');
        v_descr   := nullif(trim(coalesce(v_item->>'description', '')), '');

        -- 3d) Tái sử dụng word nếu đã tồn tại trong từ điển chung
        SELECT id INTO v_word_id FROM public.words WHERE word = v_word;

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

        -- 3e) Tạo nghĩa mới (behavior GIỮ NGUYÊN như 20260811000000)
        INSERT INTO public.word_senses (word_id, word_type, meaning, description, example)
        VALUES (v_word_id, v_type::public.word_type, v_meaning, v_descr, v_example)
        RETURNING id INTO v_sense_id;

        -- 3f) Liên kết vào set
        INSERT INTO public.set_words (set_id, word_sense_id)
        VALUES (p_set_id, v_sense_id)
        ON CONFLICT (set_id, word_sense_id) DO NOTHING;

        v_imported := v_imported + 1;
    END LOOP;

    RETURN QUERY SELECT v_imported, v_errored;
END;
$$;

GRANT EXECUTE ON FUNCTION public.import_words_to_set(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.import_words_to_set(uuid, jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
