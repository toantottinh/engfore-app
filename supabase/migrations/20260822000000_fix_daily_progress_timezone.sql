-- Fix daily progress timezone.
--
-- EngFore is used by Vietnamese learners, so the business day is
-- Asia/Ho_Chi_Minh (UTC+7). Previously every daily bucket was derived from the
-- UTC date:
--   - get_daily_goal_progress   -> log_date = (now() at time zone 'utc')::date
--   - log_learning_activity     -> (now() at time zone 'utc')::date
--   - log_daily_activity        -> (now() at time zone 'utc')::date
--   - get_learning_streak       -> (now() at time zone 'utc')::date
--   - daily_learning_log.log_date / daily_activity.activity_date defaults
--   - frontend getDailyDateKey() (daily_new_progress.day)
--
-- Because UTC only rolls to a new date at 07:00 Vietnam time, between 00:00 and
-- 06:59 VN the app kept treating the previous Vietnam day as "today": yesterday's
-- 50/50 goal still showed as completed and NEW words still counted against
-- yesterday's quota. This migration makes every daily bucket use the Vietnam
-- business date so each day has an independent record and no day inherits the
-- previous day's count.
--
-- History is preserved: no rows are deleted/updated. Rows previously keyed by
-- UTC date simply remain as historical data.

-- 1) Single source of truth for the business date --------------------------------
CREATE OR REPLACE FUNCTION public.get_business_date()
RETURNS date
LANGUAGE sql
STABLE
AS $$
  SELECT (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
$$;

GRANT EXECUTE ON FUNCTION public.get_business_date() TO anon, authenticated, service_role;

-- 2) daily_learning_log (idempotent; matches the production schema) ---------------
-- One row per (user, business_day); PK guarantees each day is an independent
-- record. The default is updated so any direct insert buckets by Vietnam date.
CREATE TABLE IF NOT EXISTS public.daily_learning_log (
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  log_date date NOT NULL DEFAULT public.get_business_date(),
  words_learned integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, log_date)
);

ALTER TABLE public.daily_learning_log
  ALTER COLUMN log_date SET DEFAULT public.get_business_date();

ALTER TABLE public.daily_learning_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own daily learning logs."
  ON public.daily_learning_log;

CREATE POLICY "Users can manage their own daily learning logs."
  ON public.daily_learning_log
  FOR ALL
  USING (auth.uid() = user_id);

GRANT ALL ON TABLE public.daily_learning_log TO anon, authenticated, service_role;

COMMENT ON TABLE public.daily_learning_log IS
  'Tracks new words learned per user per business day (Asia/Ho_Chi_Minh).';
COMMENT ON COLUMN public.daily_learning_log.log_date IS
  'Business day (Asia/Ho_Chi_Minh) the learning happened.';

-- 3) daily_activity (streak) -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.daily_activity (
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  activity_date date NOT NULL DEFAULT public.get_business_date(),
  PRIMARY KEY (user_id, activity_date)
);

ALTER TABLE public.daily_activity
  ALTER COLUMN activity_date SET DEFAULT public.get_business_date();

ALTER TABLE public.daily_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own daily activity."
  ON public.daily_activity;

CREATE POLICY "Users can manage their own daily activity."
  ON public.daily_activity
  FOR ALL
  USING (auth.uid() = user_id);

GRANT ALL ON TABLE public.daily_activity TO anon, authenticated, service_role;

COMMENT ON TABLE public.daily_activity IS
  'Tracks daily user activity for streaks (business date Asia/Ho_Chi_Minh).';


-- 4) get_daily_goal_progress ------------------------------------------------------
-- Returns TODAY'S words_learned (Vietnam date) + the user's daily goal.
-- A missing row for today must read 0 — never the latest/yesterday record.
CREATE OR REPLACE FUNCTION public.get_daily_goal_progress(p_user_id uuid)
RETURNS TABLE (words_learned integer, daily_goal integer)
LANGUAGE sql
STABLE
AS $$
  SELECT
    COALESCE(
      (SELECT dll.words_learned
         FROM public.daily_learning_log dll
        WHERE dll.user_id = p_user_id
          AND dll.log_date = public.get_business_date()),
      0
    )::int AS words_learned,
    u.daily_goal
  FROM public.users u
  WHERE u.id = p_user_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_daily_goal_progress(uuid)
  TO anon, authenticated, service_role;

-- 5) log_learning_activity ---------------------------------------------------------
-- Increments (or creates) TODAY'S row keyed by (auth.uid(), Vietnam date).
CREATE OR REPLACE FUNCTION public.log_learning_activity(p_words_learned integer)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.daily_learning_log (user_id, log_date, words_learned)
  VALUES (auth.uid(), public.get_business_date(), p_words_learned)
  ON CONFLICT (user_id, log_date)
  DO UPDATE SET words_learned = daily_learning_log.words_learned + EXCLUDED.words_learned;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_learning_activity(integer)
  TO anon, authenticated, service_role;

-- 6) log_daily_activity ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_daily_activity()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.daily_activity (user_id, activity_date)
  VALUES (auth.uid(), public.get_business_date())
  ON CONFLICT (user_id, activity_date) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_daily_activity()
  TO anon, authenticated, service_role;

-- 7) get_learning_streak ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_learning_streak(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
AS $$
WITH user_activities AS (
  SELECT DISTINCT activity_date
  FROM public.daily_activity
  WHERE user_id = p_user_id
), date_series AS (
  SELECT activity_date, activity_date - (ROW_NUMBER() OVER (ORDER BY activity_date))::int AS group_date
  FROM user_activities
), streaks AS (
  SELECT group_date, COUNT(*) AS streak_length, MAX(activity_date) as last_day
  FROM date_series
  GROUP BY group_date
)
SELECT streak_length
FROM streaks
WHERE last_day = public.get_business_date()
   OR last_day = public.get_business_date() - 1
ORDER BY last_day DESC
LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_learning_streak(uuid)
  TO anon, authenticated, service_role;

-- 8) daily_new_progress.day is a Vietnam business date key (YYYY-MM-DD) -------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'daily_new_progress_day_format_check'
      AND conrelid = 'public.daily_new_progress'::regclass
  ) THEN
    ALTER TABLE public.daily_new_progress
      ADD CONSTRAINT daily_new_progress_day_format_check
      CHECK (day ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$');
  END IF;
END $$;

COMMENT ON COLUMN public.daily_new_progress.day IS
  'Business day (Asia/Ho_Chi_Minh, YYYY-MM-DD) the NEW word was introduced.';

