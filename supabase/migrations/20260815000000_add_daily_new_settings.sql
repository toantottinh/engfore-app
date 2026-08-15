-- Add persistent per-user settings and daily NEW-word tracking.

CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  key TEXT NOT NULL,
  value_jsonb JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (user_id, key)
);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own settings."
  ON public.user_settings;

CREATE POLICY "Users can manage their own settings."
  ON public.user_settings
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


CREATE TABLE IF NOT EXISTS public.daily_new_progress (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  day TEXT NOT NULL,
  word_sense_id UUID NOT NULL,
  PRIMARY KEY (user_id, day, word_sense_id)
);

ALTER TABLE public.daily_new_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own daily new progress."
  ON public.daily_new_progress;

CREATE POLICY "Users can manage their own daily new progress."
  ON public.daily_new_progress
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


CREATE INDEX IF NOT EXISTS user_settings_user_id_idx
  ON public.user_settings (user_id);

CREATE INDEX IF NOT EXISTS daily_new_progress_user_id_idx
  ON public.daily_new_progress (user_id);

CREATE INDEX IF NOT EXISTS daily_new_progress_day_idx
  ON public.daily_new_progress (day);
