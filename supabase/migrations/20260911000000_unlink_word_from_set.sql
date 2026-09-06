-- =====================================================================
-- unlink_word_from_set — remove a word from ONE Word Set only.
--
-- WHY (two distinct DELETE semantics):
--   remove_from_vocabulary  = "Xóa khỏi kho": deletes ownership + SRS +
--                             all set memberships of the user.
--   remove_word_from_set    = legacy set-scoped removal that ALSO cleans
--                             up user_progress / user_vocabulary when the
--                             word leaves the user's LAST set (wrong for
--                             the new "Xóa khỏi bộ từ" UX).
--   unlink_word_from_set    = NEW: deletes ONLY the membership row
--                             (set_words) for (set_id, word_sense_id) on a
--                             set the caller owns. The word STAYS in the
--                             user's library (user_vocabulary) and SRS
--                             (user_progress) are preserved.
--
-- Security:
--   * SECURITY DEFINER + explicit authorization check that the target set
--     belongs to auth.uid() (the RLS on set_words is based on
--     vocabulary_sets.user_id, but SECURITY DEFINER bypasses it, so the
--     check below is the real gate — Authorization cannot be bypassed).
--   * Never touches user_vocabulary / user_progress / words / word_senses /
--     vocabulary_sets.
--   * Never affects other users' sets/rows.
--
-- Idempotent (CREATE OR REPLACE). New migration — no existing migration
-- or RPC was modified.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.unlink_word_from_set(
  p_set_id uuid,
  p_word_sense_id uuid
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

  IF p_set_id IS NULL OR p_word_sense_id IS NULL THEN
    RAISE EXCEPTION 'Thiếu id của bộ từ hoặc của từ.';
  END IF;

  -- Authorization: only the set owner may unlink a word from their set.
  -- Explicit ownership gate (bypasses RLS because of SECURITY DEFINER).
  IF NOT EXISTS (
    SELECT 1
    FROM public.vocabulary_sets
    WHERE id = p_set_id
      AND user_id = v_user
  ) THEN
    RAISE EXCEPTION 'Bạn không có quyền xóa từ khỏi bộ từ này.';
  END IF;

  -- Delete ONLY the membership row. Never cascades to ownership/SRS.
  DELETE FROM public.set_words sw
  WHERE sw.set_id = p_set_id
    AND sw.word_sense_id = p_word_sense_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN QUERY SELECT v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.unlink_word_from_set(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.unlink_word_from_set(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.unlink_word_from_set(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlink_word_from_set(uuid, uuid) TO service_role;