-- =====================================================================
-- Migration: Allow trusted service_role to read get_words_in_set_with_progress
--
-- Context: The previous version of this function returned an empty result
-- for service_role because auth.uid() IS NULL for that role and the
-- unauthenticated guard rejected it.
--
-- service_role is the trusted backend/DB admin role: it already bypasses
-- RLS on every table through the Data API. Letting it read this RPC is
-- therefore not a new exposure, and it enables backend/operational reads.
--
-- Security is preserved for end users:
--   * anon          -> denied (no EXECUTE; and the uid guard).
--   * unauthenticated/non-owner/non-admin authenticated users -> empty.
--   * set owner     -> their set + their own progress (p_user_id).
--   * admin         -> any set, for the requested p_user_id.
--   * service_role  -> any set (trusted backend role).
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
    v_allowed  boolean := false;
BEGIN
    -- Trusted backend role may read any set.
    IF auth.role() = 'service_role' THEN
        v_allowed := true;
    ELSIF v_uid IS NOT NULL THEN
        -- Owner of the set, or an admin, may read.
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

-- Keep EXECUTE locked to the intended roles (never re-open to anon/PUBLIC).
REVOKE ALL ON FUNCTION public.get_words_in_set_with_progress(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_words_in_set_with_progress(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_words_in_set_with_progress(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_words_in_set_with_progress(uuid, uuid) TO service_role;

-- Refresh PostgREST schema cache so PostgREST sees the updated function.
NOTIFY pgrst, 'reload schema';
