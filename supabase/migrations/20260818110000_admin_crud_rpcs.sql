-- EngFore - Migration 4: Admin Import and Word/Set Management RPCs
-- This migration adds functions for admins to manage public content and for all users to manage sets.

-- 1. Create admin_import_words RPC
-- This is a variant of the 'import_words' RPC specifically for admins.
-- It bypasses the user ownership check, allowing imports into public sets (user_id IS NULL).
-- It requires admin privileges to run.

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
  -- Security Check: This function is for admins only.
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can import to public sets.';
  END IF;

  -- Optional: create a new PUBLIC Word Set.
  IF v_set IS NULL AND p_new_set_name IS NOT NULL AND trim(p_new_set_name) <> '' THEN
    INSERT INTO public.vocabulary_sets (user_id, name, topic_id, status)
    VALUES (NULL, trim(p_new_set_name), p_new_set_topic_id, p_new_set_status)
    RETURNING id INTO v_set;
  END IF;

  -- The rest of the logic is identical to the user-facing import_words,
  -- but it operates on the set_id provided, which can now be a public set.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_words_data) LOOP
    v_word := trim(coalesce(v_item->>'word', ''));
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

-- 2. Create admin_update_word RPC
-- Allows admin to update the canonical word and sense.
CREATE OR REPLACE FUNCTION public.admin_update_word(
  p_word_id uuid,
  p_sense_id uuid,
  p_word_data jsonb
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can update canonical words.';
  END IF;

  -- Update word_senses table
  UPDATE public.word_senses
  SET
    word_type = (p_word_data->>'word_type')::word_type,
    meaning = p_word_data->>'meaning',
    description = p_word_data->>'memory_clue',
    example = p_word_data->>'example'
  WHERE id = p_sense_id;

  -- Update words table
  UPDATE public.words
  SET
    word = p_word_data->>'word',
    ipa = p_word_data->>'ipa',
    cefr_level = (p_word_data->>'cefr_level')::cefr_level
  WHERE id = p_word_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_update_word(uuid, uuid, jsonb) TO authenticated;
