-- =====================================================================
-- Unified Learn Engine: fix get_new_words_for_session — deduplicate
-- word_senses that belong to multiple prioritized sets (Rule 4).
--
-- Problem:
--   A word_sense can belong to several sets (set_words has one row per
--   (set_id, word_sense_id)).  The previous version joined set_words ×
--   set_priority WITHOUT deduplication, so a sense in Set A (priority 1)
--   and Set B (priority 2) produced TWO result rows.  Each duplicate
--   consumed one p_limit slot, so a session could fill its NEW quota with
--   fewer unique cards than requested — and the effective priority was the
--   row's set priority, not the MIN across all sets the word belongs to.
--
-- Fix:
--   * DISTINCT ON (sw.word_sense_id) keeps the row with the SMALLEST
--     set priority (MIN semantics: "học trước nếu thuộc bất kỳ Set nào
--     được ưu tiên hơn").
--   * The final ORDER BY uses that effective priority then word_sense id,
--     so results are deterministic and priority-ordered.
--   * LIMIT now consumes only unique cards.
--
-- Idempotent (CREATE OR REPLACE), safe to apply on an existing deployment.
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
  -- The array is already ordered: index 0 = highest priority.
  SELECT
    val AS set_id,
    idx AS priority
  FROM unnest(p_set_ids_prioritized) WITH ORDINALITY AS t(val, idx)
),
ranked AS (
  SELECT
    DISTINCT ON (sw.word_sense_id)
    sw.word_sense_id,
    sw.set_id,
    sp.priority
  FROM
    public.set_words sw
  JOIN
    set_priority sp ON sw.set_id = sp.set_id
  LEFT JOIN
    public.user_progress up ON up.word_sense_id = sw.word_sense_id AND up.user_id = p_user_id
  WHERE
    -- Must be a NEW word for this user
    up.word_sense_id IS NULL
    -- Exclude any senses already picked in this session (due/learning queues)
    AND sw.word_sense_id <> ALL(p_excluded_sense_ids)
  ORDER BY
    sw.word_sense_id,
    sp.priority ASC -- DISTINCT ON keeps the row with the MINIMUM set priority
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
    r.set_id
FROM
    ranked r
JOIN
    public.word_senses ws ON ws.id = r.word_sense_id
JOIN
    public.words w ON ws.word_id = w.id
ORDER BY
    r.priority ASC,   -- effective (min) set priority, lower = learned first
    ws.id ASC         -- deterministic order within the same priority
LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_new_words_for_session(uuid, uuid[], integer, uuid[])
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_new_words_for_session(uuid, uuid[], integer, uuid[]) IS
$$
Fetches NEW words for a user's learning session.  A word_sense that belongs to
several prioritized sets is returned exactly ONCE, using the MINIMUM set priority
(Rule 4: dedup + effective priority), then ordered by effective priority.
$$;
