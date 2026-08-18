-- =====================================================================
-- Unified Learn Engine: normalize set learn priorities (deterministic)
--
-- The initial backfill (20260824000000) assigned priority = 1 to EVERY
-- existing set, so a single user's sets all had the SAME learn_priority.
-- Ordering therefore fell back to arbitrary tie-breaks (set_id / created_at
-- DESC) and broke the documented convention:
--     ORDER BY learning_priority ASC, created_at ASC, id ASC
--
-- This migration:
--   1) Adds a composite index (user_id, learn_priority) so lookups and the
--      get_new_words_for_session JOIN are served by an index.
--   2) For users who still have DUPLICATE priorities (i.e. never explicitly
--      reordered), re-assign a unique 1..N order using ROW_NUMBER() OVER
--      (PARTITION BY user_id ORDER BY created_at ASC, id ASC) — the exact
--      deterministic convention requested.  Users who already have unique
--      priorities (they reordered via the UI) are left untouched.
--   3) Defensive backfill: every set owned by a user gets a priority row,
--      appended at the end of that user's existing order (MAX+1).
--
-- Idempotent: after the first run no duplicate priorities remain, so run 2
-- changes nothing; ON CONFLICT DO NOTHING guards every insert.
-- =====================================================================

-- 1) Composite index for priority-ordered lookups -------------------------
CREATE INDEX IF NOT EXISTS user_set_learn_priority_user_priority_idx
  ON public.user_set_learn_priority (user_id, learn_priority);

-- 2) Normalize duplicate priorities to a unique deterministic 1..N ---------
--    Only touches users with duplicate priorities (never overwrites an
--    explicit reorder).  The window orders by created_at ASC, id ASC → older
--    (or smaller-id) sets get the smaller priority number → learned first.
WITH normalized AS (
  SELECT
    ump.user_id,
    ump.set_id,
    ROW_NUMBER() OVER (
      PARTITION BY ump.user_id
      ORDER BY s.created_at ASC, s.id ASC
    ) AS new_priority
  FROM public.user_set_learn_priority ump
  JOIN public.vocabulary_sets s ON s.id = ump.set_id
  WHERE ump.user_id IN (
    -- users with at least one duplicated priority value
    SELECT user_id
    FROM public.user_set_learn_priority
    GROUP BY user_id
    HAVING COUNT(*) <> COUNT(DISTINCT learn_priority)
  )
)
UPDATE public.user_set_learn_priority ump
SET learn_priority = n.new_priority
FROM normalized n
WHERE ump.user_id = n.user_id
  AND ump.set_id  = n.set_id;

-- 3) Defensive backfill: every owned set has a priority row, appended last --
DO $$
DECLARE
  v_set   RECORD;
  v_next  INTEGER;
BEGIN
  FOR v_set IN
    SELECT s.id, s.user_id
      FROM public.vocabulary_sets s
     WHERE s.user_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.user_set_learn_priority up
          WHERE up.user_id = s.user_id
            AND up.set_id   = s.id
       )
     ORDER BY s.created_at ASC NULLS LAST, s.id ASC
  LOOP
    SELECT COALESCE(MAX(learn_priority) + 1, 1)
      INTO v_next
      FROM public.user_set_learn_priority
     WHERE user_id = v_set.user_id;

    INSERT INTO public.user_set_learn_priority (user_id, set_id, learn_priority)
    VALUES (v_set.user_id, v_set.id, v_next)
    ON CONFLICT (user_id, set_id) DO NOTHING;
  END LOOP;
END $$;

COMMENT ON TABLE public.user_set_learn_priority IS
$$
User-defined priority order for learning sets.  Lower number = learned first.
Priorities are unique per user (1..N) after 20260828000000_normalize_set_learn_priorities.
$$;