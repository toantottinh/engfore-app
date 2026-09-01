-- =====================================================================
-- Vocabulary ↔ SRS consistency: remove_word_from_set + orphan cleanup
--
-- Bug:
--   The VocabularyDetail "delete word" action deleted the set_words row
--   directly from the client. The user's user_progress row (FSRS state)
--   survived, so a word removed from Vocabulary kept surfacing in the
--   Learning Session (DUE / LEARNING queues): SRS state was not tied to
--   vocabulary membership (set_words + vocabulary_sets = source of truth).
--
-- Fix:
--   * remove_word_from_set(p_set_id, p_word_sense_id):
--       - deletes the set_words link (set must be owned by the caller);
--       - ONLY IF the word_sense no longer belongs to ANY of the caller's
--         sets, deletes that user's user_progress row and the user's
--         user_vocabulary (library) row for the sense;
--       - if the word still lives in another set of the same user, ALL
--         SRS progress and library ownership are preserved.
--       - Never touches global data (words / word_senses) and never
--         affects other users.
--   * One-time safe cleanup of pre-existing orphaned user_progress rows:
--     progress whose word_sense no longer belongs to ANY set owned by the
--     same user. Per-user progress rows only — no global data removed.
--
-- Idempotent (CREATE OR REPLACE + conditional deletes). New migration —
-- no existing migration was modified.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.remove_word_from_set(
    p_set_id uuid,
    p_word_sense_id uuid
)
RETURNS TABLE(removed_set_links int, removed_progress int, removed_ownership int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user uuid := auth.uid();
    v_links int := 0;
    v_prog  int := 0;
    v_own   int := 0;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'Bạn cần đăng nhập.';
    END IF;
    IF p_set_id IS NULL OR p_word_sense_id IS NULL THEN
        RAISE EXCEPTION 'Thiếu id của bộ từ hoặc của từ.';
    END IF;

    -- Only the set owner may remove a word from their set.
    IF NOT EXISTS (
        SELECT 1
        FROM public.vocabulary_sets
        WHERE vocabulary_sets.id = p_set_id
          AND vocabulary_sets.user_id = v_user
    ) THEN
        RAISE EXCEPTION 'Bạn không có quyền xóa từ khỏi bộ từ này.';
    END IF;

    -- 1) Remove the set link (idempotent: 0 or 1 row).
    DELETE FROM public.set_words sw
    WHERE sw.set_id = p_set_id
      AND sw.word_sense_id = p_word_sense_id;
    GET DIAGNOSTICS v_links = ROW_COUNT;

    -- 2) Cleanup ONLY when the sense has left EVERY set owned by this user.
    --    If it still belongs to at least one other set of the same user,
    --    keep user_progress (SRS continues) and user_vocabulary (library).
    IF NOT EXISTS (
        SELECT 1
        FROM public.set_words sw
        JOIN public.vocabulary_sets vs ON vs.id = sw.set_id
        WHERE sw.word_sense_id = p_word_sense_id
          AND vs.user_id = v_user
    ) THEN
        DELETE FROM public.user_progress up
        WHERE up.user_id = v_user
          AND up.word_sense_id = p_word_sense_id;
        GET DIAGNOSTICS v_prog = ROW_COUNT;

        DELETE FROM public.user_vocabulary uv
        WHERE uv.user_id = v_user
          AND uv.word_sense_id = p_word_sense_id;
        GET DIAGNOSTICS v_own = ROW_COUNT;
    END IF;

    RETURN QUERY SELECT v_links, v_prog, v_own;
END;
$$;

REVOKE ALL ON FUNCTION public.remove_word_from_set(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.remove_word_from_set(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.remove_word_from_set(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_word_from_set(uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------
-- One-time cleanup: drop orphaned SRS rows created before this fix
-- (progress for word_senses that are no longer in any of the user's
-- sets). Membership = set_words JOIN vocabulary_sets per user.
-- ---------------------------------------------------------------------
DELETE FROM public.user_progress up
WHERE NOT EXISTS (
    SELECT 1
    FROM public.set_words sw
    JOIN public.vocabulary_sets vs ON vs.id = sw.set_id
    WHERE sw.word_sense_id = up.word_sense_id
      AND vs.user_id = up.user_id
);
