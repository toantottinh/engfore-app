-- ============================================================
-- Word Set v2 — RPCs (SECURITY DEFINER)
--   1) import_words          : one-call import (vocab + optional Set).
--   2) remove_from_vocabulary: transaction-safe removal for one user.
-- ============================================================

-- ***** 1) import_words *****
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
    RAISE EXCEPTION 'Bạn cần đăng nhập.';
  END IF;

  -- Optional: create a new Word Set owned by the caller.
  IF v_set IS NULL AND p_new_set_name IS NOT NULL AND trim(p_new_set_name) <> '' THEN
    INSERT INTO public.vocabulary_sets (user_id, name)
    VALUES (v_user, trim(p_new_set_name))
    RETURNING id INTO v_set;
  END IF;

  -- Ownership check: only import into a Set the caller owns.
  IF v_set IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.vocabulary_sets WHERE id = v_set AND user_id = v_user
  ) THEN
    RAISE EXCEPTION 'Bạn không có quyền nhập vào bộ từ này.';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_words_data) LOOP
    -- Normalize
    v_word := trim(coalesce(v_item->>'word', ''));
    IF v_word = '' THEN v_errored := v_errored + 1; CONTINUE; END IF;

    v_ipa    := nullif(trim(coalesce(v_item->>'ipa','')),'');
    v_cefr   := nullif(upper(trim(coalesce(v_item->>'cefr',''))),'');
    v_type   := lower(coalesce(nullif(trim(coalesce(v_item->>'word_type','')),''),'other'));
    v_meaning := trim(coalesce(v_item->>'meaning',''));
    v_example := nullif(trim(coalesce(v_item->>'example','')),'');
    v_descr   := nullif(trim(coalesce(v_item->>'memory_clue', v_item->>'description','')),'');

    -- Normalize word_type to a valid enum value.
    v_type := CASE v_type
      WHEN 'phrasal verb'  THEN 'phrasal_verb'
      WHEN 'phrasal-verb'  THEN 'phrasal_verb'
      WHEN 'phrasalverb'   THEN 'phrasal_verb'
      WHEN 'phrasal verbs' THEN 'phrasal_verb'
      WHEN 'verb phrase'   THEN 'verb_phrase'
      WHEN 'verb-phrase'   THEN 'verb_phrase'
      WHEN 'verbphrase'    THEN 'verb_phrase'
      WHEN 'verb phrases'  THEN 'verb_phrase'
      WHEN 'v.' THEN 'verb'
      WHEN 'n.' THEN 'noun'
      WHEN 'adj.' THEN 'adjective'
      WHEN 'adv.' THEN 'adverb'
      WHEN 'prep.' THEN 'preposition'
      WHEN 'conj.' THEN 'conjunction'
      WHEN 'pron.' THEN 'pronoun'
      ELSE v_type
    END;

    -- Validate word_type / cefr before enum casts.
    IF v_type NOT IN ('noun','verb','adjective','adverb','preposition','conjunction',
                      'pronoun','other','determiner','interjection','phrasal_verb','verb_phrase') THEN
      v_errored := v_errored + 1; CONTINUE;
    END IF;
    IF v_cefr IS NOT NULL AND v_cefr NOT IN ('A1','A2','B1','B2','C1','C2') THEN
      v_errored := v_errored + 1; CONTINUE;
    END IF;

    -- 1) create/reuse global word (case-insensitive)
    SELECT id INTO v_word_id FROM public.words WHERE lower(word) = lower(v_word);
    IF v_word_id IS NULL THEN
      IF v_cefr IS NOT NULL THEN
        INSERT INTO public.words (word, ipa, cefr_level)
        VALUES (v_word, v_ipa, v_cefr::public.cefr_level)
        ON CONFLICT (lower(word)) DO NOTHING
        RETURNING id INTO v_word_id;
      ELSE
        INSERT INTO public.words (word, ipa)
        VALUES (v_word, v_ipa)
        ON CONFLICT (lower(word)) DO NOTHING
        RETURNING id INTO v_word_id;
      END IF;
      IF v_word_id IS NULL THEN
        SELECT id INTO v_word_id FROM public.words WHERE lower(word) = lower(v_word);
      END IF;
    END IF;

    -- 2) create/reuse global word_sense by canonical identity
    --    (word_id, word_type, normalize(meaning))
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

    -- 3) ownership (idempotent)
    INSERT INTO public.user_vocabulary (user_id, word_sense_id)
    VALUES (v_user, v_sense)
    ON CONFLICT DO NOTHING;

    -- 4) optional Set link (idempotent)
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
-- ***** 2) remove_from_vocabulary *****
DROP FUNCTION IF EXISTS public.remove_from_vocabulary(uuid);

CREATE OR REPLACE FUNCTION public.remove_from_vocabulary(p_word_sense_id uuid)
RETURNS TABLE(removed_ownership int, removed_progress int, removed_set_links int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_own  int;
  v_prog int;
  v_links int;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Bạn cần đăng nhập.';
  END IF;
  IF p_word_sense_id IS NULL THEN
    RAISE EXCEPTION 'Thiếu id của từ.';
  END IF;

  -- Remove ownership (Vocabulary membership).
  DELETE FROM public.user_vocabulary
  WHERE user_id = v_user AND word_sense_id = p_word_sense_id;
  GET DIAGNOSTICS v_own = ROW_COUNT;

  -- Remove this user's FSRS progress for the sense (per-user row, safe).
  DELETE FROM public.user_progress
  WHERE user_id = v_user AND word_sense_id = p_word_sense_id;
  GET DIAGNOSTICS v_prog = ROW_COUNT;

  -- Remove the sense from every Set the user owns (not other users' sets).
  DELETE FROM public.set_words
  WHERE word_sense_id = p_word_sense_id
    AND set_id IN (SELECT id FROM public.vocabulary_sets WHERE user_id = v_user);
  GET DIAGNOSTICS v_links = ROW_COUNT;

  RETURN QUERY SELECT v_own, v_prog, v_links;
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_from_vocabulary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_from_vocabulary(uuid) TO service_role;

-- The legacy import_words_to_set always created a fresh sense and now clashes
-- with the canonical unique index; superseded by import_words.
DROP FUNCTION IF EXISTS public.import_words_to_set(uuid, jsonb);
GRANT EXECUTE ON FUNCTION public.import_words(jsonb, uuid, text) TO service_role;