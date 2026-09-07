-- =====================================================================
-- unlink_words_from_set — bulk remove words from ONE Word Set only.
--
-- WHY:
--   unlink_word_from_set  = single-word version (migration 20260911000000).
--   unlink_words_from_set = NEW bulk version for multi-select UI.
--
-- Semantics: deletes ONLY membership rows (set_words) for (set_id, word_sense_ids)
-- on a set the caller owns. Words STAY in user_vocabulary + user_progress.
--
-- Security: SECURITY DEFINER + explicit ownership gate (bypasses RLS).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.unlink_words_from_set(
  p_set_id       uuid,
  p_word_sense_ids uuid[]
)
RETURNS TABLE(removed_count int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user  uuid := auth.uid();
  v_count int;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Bạn cần đăng nhập.';
  END IF;

  IF p_set_id IS NULL OR p_word_sense_ids IS NULL OR array_length(p_word_sense_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Thiếu id của bộ từ hoặc danh sách từ.';
  END IF;

  -- Authorization: only the set owner may unlink words from their set.
  IF NOT EXISTS (
    SELECT 1
    FROM public.vocabulary_sets
    WHERE id = p_set_id
      AND user_id = v_user
  ) THEN
    RAISE EXCEPTION 'Bạn không có quyền xóa từ khỏi bộ từ này.';
  END IF;

  -- Delete ONLY membership rows. Never cascades to ownership/SRS.
  DELETE FROM public.set_words sw
  WHERE sw.set_id = p_set_id
    AND sw.word_sense_id = ANY(p_word_sense_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN QUERY SELECT v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.unlink_words_from_set(uuid, uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.unlink_words_from_set(uuid, uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.unlink_words_from_set(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlink_words_from_set(uuid, uuid[]) TO service_role;
