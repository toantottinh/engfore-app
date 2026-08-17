-- =====================================================================
-- Migration: Fix + harden get_words_in_set_with_progress
--
-- Root cause discovered after deployment:
--   1) The RETURNS TABLE output columns (id, word_id, word, ...) are
--      in-scope PL/pgSQL variables. The access-check used the bare name
--      `id`, which collides with the OUT parameter -> SQLSTATE 42702
--      "column reference \"id\" is ambiguous".
--   2) ALTER DEFAULT PRIVILEGES ... GRANT ALL ON ROUTINES TO anon made
--      anon able to EXECUTE this SECURITY DEFINER function. For an
--      unauthenticated caller auth.uid() IS NULL, so the ownership check
--      `(role ... ) <> 'admin'` evaluated to NULL and fell through,
--      leaking any p_set_id / p_user_id data. This is now guarded.
--
-- Chosen approach (matches repo convention):
--   * SECURITY DEFINER + SET search_path = public (same as other RPCs).
--   * Qualify every column that shares a name with an OUT parameter.
--   * Reject unauthenticated callers.
--   * Only the set owner or an admin can read; admin bypass reuses
--     public.is_admin() (the repo's single source of truth).
--   * Revoke EXECUTE from anon/PUBLIC; grant only to authenticated
--     and service_role.
-- =====================================================================

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
    v_is_admin boolean := coalesce(
        (SELECT (users.role = 'admin'::public.user_role)
           FROM public.users
          WHERE users.id = auth.uid()),
        false
    );
BEGIN
    -- Reject unauthenticated callers (auth.uid() IS NULL).
    IF v_uid IS NULL THEN
        RETURN;
    END IF;

    -- Only the set owner, or an admin, may read this set's words/progress.
    -- NOTE: every column below is qualified to avoid clashing with the
    -- RETURNS TABLE output parameters (id, user_id, ...).
    IF NOT v_is_admin AND NOT EXISTS (
        SELECT 1
        FROM public.vocabulary_sets
        WHERE vocabulary_sets.id = p_set_id
          AND vocabulary_sets.user_id = v_uid
    ) THEN
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

-- Lock down EXECUTE: default privileges (and Postgres' implicit PUBLIC
-- grant) would expose this to anon; explicitly revoke and re-grant only
-- to the intended roles.
REVOKE ALL ON FUNCTION public.get_words_in_set_with_progress(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_words_in_set_with_progress(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_words_in_set_with_progress(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_words_in_set_with_progress(uuid, uuid) TO service_role;

-- Refresh PostgREST schema cache so the updated function is immediately
-- visible through the Data API (avoids stale PGRST202).
NOTIFY pgrst, 'reload schema';
