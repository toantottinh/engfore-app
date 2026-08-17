-- =====================================================================
-- Fix SRS "Học ngắt quãng": surface NEW words + server-side session queue.
--
-- Root cause (audited in the repo):
--   1) get_words_in_set_with_progress used a LEFT JOIN on user_progress, so a
--      brand-new word (no user_progress row) came back with `state = NULL`.
--      useLearningSession then filtered `data.filter(w => w.state === 'new')`,
--      so NEW words were silently dropped -> an otherwise full set appeared as
--      "Không có từ nào để học".
--   2) The global "/learn" queue only fetched DUE reviews (getDueReviewWords),
--      so NEW words were never offered there either.
--   3) The whole set (2000+ rows) was transferred to the client just to filter.
--
-- Fix:
--   * COALESCE defaults in get_words_in_set_with_progress so NEW words are
--     reported as state='new' (for the vocabulary detail view);
--   * NEW get_srs_session_words: returns ONLY the session queue today
--     (due + learning + NEW capped by daily_new_limit & introduced-today),
--     scoped to one set or the whole user vocabulary, with proper
--     `session_status` ('new'/'review'). Filtering happens in the DB, so large
--     sets (2000+/10000+) never transfer all rows to the client.
--   * NEW get_srs_session_counts: cheap counts used to show the right empty
--     state instead of a generic "no words" message.
-- =====================================================================

-- 1) get_words_in_set_with_progress — report NEW words correctly ------------
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
    IF auth.role() = 'service_role' THEN
        v_allowed := true;
    ELSIF v_uid IS NOT NULL THEN
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
        coalesce(up.mastery_level, 0)::int AS mastery_level,
        up.review_due_at,
        up.last_reviewed_at,
        coalesce(up.repetitions, 0)::int AS repetitions,
        coalesce(up.interval_hours, 0)::int AS interval_hours,
        coalesce(up.ease_factor, 2.5)::numeric AS ease_factor,
        coalesce(up.lapses, 0)::int AS lapses,
        coalesce(up.state, 'new')::text AS state,
        coalesce(up.learning_step, 0)::int AS learning_step,
        coalesce(up.flashcard_reviews, 0)::int AS flashcard_reviews
    FROM public.set_words sw
    JOIN public.word_senses ws  ON sw.word_sense_id = ws.id
    JOIN public.words w         ON ws.word_id = w.id
    LEFT JOIN public.user_progress up
           ON up.word_sense_id = ws.id
          AND up.user_id = p_user_id
    WHERE sw.set_id = p_set_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_words_in_set_with_progress(uuid, uuid)
  TO authenticated, service_role;
