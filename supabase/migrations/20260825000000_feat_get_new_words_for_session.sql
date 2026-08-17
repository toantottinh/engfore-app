-- =====================================================================
-- Unified Learn Engine: Get NEW words for a session
--
-- Efficiently fetches words that a user has not seen yet (no entry
-- in user_progress), respecting a user-defined set priority order.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_new_words_for_session(
    p_user_id uuid,
    p_set_ids_prioritized uuid[],
    p_limit integer,
    p_excluded_sense_ids uuid[] DEFAULT ARRAY[]::uuid[]
)
RETURNS TABLE (
    id uuid,
    word text,
    ipa text,
    cefr_level text,
    word_type text,
    meaning text,
    memory_clue text,
    example text,
    mastery_level integer,
    review_count integer,
    flashcard_reviews integer,
    review_due_at timestamptz,
    last_reviewed_at timestamptz,
    repetitions integer,
    interval_hours double precision,
    ease_factor double precision,
    lapses integer,
    state text,
    learning_step integer,
    set_id uuid
)
LANGUAGE sql
STABLE
AS $$
WITH set_priority AS (
  SELECT
    val AS set_id,
    idx AS priority
  FROM unnest(p_set_ids_prioritized) WITH ORDINALITY AS t(val, idx)
)
SELECT
    ws.id,
    w.word,
    w.ipa,
    w.cefr_level,
    ws.word_type,
    ws.meaning,
    ws.description AS memory_clue,
    ws.example,
    -- Default values for a NEW word
    0 AS mastery_level,
    0 AS review_count,
    0 AS flashcard_reviews,
    NULL::timestamptz AS review_due_at,
    NULL::timestamptz AS last_reviewed_at,
    0 AS repetitions,
    0.0 AS interval_hours,
    2.5 AS ease_factor,
    0 AS lapses,
    'new'::text AS state,
    0 AS learning_step,
    sw.set_id
FROM
    public.set_words sw
JOIN
    set_priority sp ON sw.set_id = sp.set_id
JOIN
    public.word_senses ws ON sw.word_sense_id = ws.id
JOIN
    public.words w ON ws.word_id = w.id
LEFT JOIN
    public.user_progress up ON up.word_sense_id = sw.word_sense_id AND up.user_id = p_user_id
WHERE
    -- Must be a NEW word for this user
    up.word_sense_id IS NULL
    -- Exclude any senses already picked in this session (e.g. from due/learning queues)
    AND sw.word_sense_id <> ALL(p_excluded_sense_ids)
ORDER BY
    sp.priority ASC,
    ws.id ASC -- Deterministic order within the same priority
LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_new_words_for_session(uuid, uuid[], integer, uuid[])
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_new_words_for_session(uuid, uuid[], integer, uuid[]) IS
  'Fetches new words for a user''s learning session, respecting set priority and excluding words already in progress.';
