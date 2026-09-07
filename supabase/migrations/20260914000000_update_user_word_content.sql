-- =====================================================================
-- update_user_word_content — USER-OWNED content edit handler.
--
-- WHY (task: server-side handlers for Word Set edit):
--   update_user_word (20260829000000) updates GLOBAL word_senses/words —
--   forbidden for personal content edits. User-owned content lives in
--   user_vocabulary.example / user_vocabulary.memory_clue (migration
--   20260907000001). This RPC writes ONLY the caller's own
--   user_vocabulary row. It NEVER touches:
--     words / word_senses / user_progress / vocabulary_sets / set_words
--     or any other user's rows (user_id is derived from auth.uid()).
--
-- Security: SECURITY DEFINER + explicit auth/ownership gate (bypasses RLS).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.update_user_word_content(
  p_word_sense_id uuid,
  p_example       text,
  p_memory_clue   text
)
RETURNS TABLE(updated_count int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Bạn cần đăng nhập.';
  END IF;

  IF p_word_sense_id IS NULL THEN
    RAISE EXCEPTION 'Thiếu id của từ.';
  END IF;

  -- Upsert ONLY the caller's own user_vocabulary row (user_id = auth.uid(),
  -- never client-supplied). Creates the ownership/content row for this user
  -- if missing; updates example/memory_clue otherwise. Global dictionary
  -- (words / word_senses) and SRS (user_progress) are untouched.
  INSERT INTO public.user_vocabulary AS uv (user_id, word_sense_id, example, memory_clue)
  VALUES (v_user, p_word_sense_id, nullif(trim(coalesce(p_example, '')), ''), nullif(trim(coalesce(p_memory_clue, '')), ''))
  ON CONFLICT (user_id, word_sense_id)
  DO UPDATE
    SET example     = nullif(trim(coalesce(p_example, '')), ''),
        memory_clue = nullif(trim(coalesce(p_memory_clue, '')), '');

  RETURN QUERY SELECT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.update_user_word_content(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_user_word_content(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_user_word_content(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_user_word_content(uuid, text, text) TO service_role;
