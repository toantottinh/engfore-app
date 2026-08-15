-- Add flashcard_reviews to user_progress to track how many times a word
-- has been reviewed in Flashcard mode. Words need 2 flashcard reviews
-- before they graduate to Typing mode.

ALTER TABLE public.user_progress
  ADD COLUMN IF NOT EXISTS flashcard_reviews INTEGER DEFAULT 0 NOT NULL;

-- Backfill: words that have been studied (state != 'new') have at least
-- completed their first flashcard review. Set to 1 so they don't restart
-- from zero, but still require one more flashcard before typing.
UPDATE public.user_progress
SET flashcard_reviews = 1
WHERE state != 'new'
  AND flashcard_reviews = 0;

-- Make the new column visible to the Data API immediately after deployment.
NOTIFY pgrst, 'reload schema';
