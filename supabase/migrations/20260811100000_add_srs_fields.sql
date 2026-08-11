-- Add SRS fields to user_progress for FSRS-style scheduling.

ALTER TABLE public.user_progress
  ADD COLUMN IF NOT EXISTS repetitions INTEGER DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS interval_hours INTEGER DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS ease_factor NUMERIC(3,2) DEFAULT 2.50 NOT NULL,
  ADD COLUMN IF NOT EXISTS lapses INTEGER DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS review_count INTEGER DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS state TEXT DEFAULT 'new' NOT NULL,
  ADD COLUMN IF NOT EXISTS learning_step INTEGER DEFAULT 0 NOT NULL;

-- Backfill existing studied cards.
UPDATE public.user_progress
SET
  state = 'review',
  interval_hours = CASE
    WHEN mastery_level = 1 THEN 24
    WHEN mastery_level = 2 THEN 48
    WHEN mastery_level = 3 THEN 72
    WHEN mastery_level = 4 THEN 168
    WHEN mastery_level >= 5 THEN 336
    ELSE 24
  END
WHERE mastery_level > 0
  AND state = 'new';

-- Restrict SRS state values.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_progress_state_check'
  ) THEN
    ALTER TABLE public.user_progress
      ADD CONSTRAINT user_progress_state_check
      CHECK (state IN ('new', 'learning', 'review', 'relearning'));
  END IF;
END
$$;
