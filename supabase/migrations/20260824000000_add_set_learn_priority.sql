-- =====================================================================
-- Unified Learn Engine: set learning priority
--
-- Allows users to set the order in which NEW words from different sets
-- are presented in a session. Priority is user-specific and does not
-- affect SRS data or other users.
--
-- Priority: lower number = higher priority (default = 1 = highest)
--=====================================================================

-- 1) user_set_learn_priority — user preference for set learn order ------------
CREATE TABLE IF NOT EXISTS public.user_set_learn_priority (
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  set_id       uuid        NOT NULL REFERENCES public.vocabulary_sets(id) ON DELETE CASCADE,
  learn_priority INTEGER DEFAULT 1 NOT NULL,
  PRIMARY KEY (user_id, set_id)
);

ALTER TABLE public.user_set_learn_priority ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own learn priorities."
  ON public.user_set_learn_priority;

CREATE POLICY "Users can manage their own learn priorities."
  ON public.user_set_learn_priority
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT ALL ON TABLE public.user_set_learn_priority TO anon, authenticated, service_role;

COMMENT ON TABLE public.user_set_learn_priority IS
  'User-defined priority order for learning sets. Lower number = learned first.';

-- 2) Index + helper function ---------------------------------------------------
CREATE INDEX IF NOT EXISTS user_set_learn_priority_user_id_idx
  ON public.user_set_learn_priority (user_id);

CREATE INDEX IF NOT EXISTS user_set_learn_priority_set_id_idx
  ON public.user_set_learn_priority (set_id);

-- 3) Default priority for all existing user/set combos -----------------------
DO $$
DECLARE
  v_sets RECORD;
BEGIN
    FOR v_sets IN
    SELECT id, user_id FROM public.vocabulary_sets
    WHERE user_id IS NOT NULL
  LOOP
    INSERT INTO public.user_set_learn_priority (user_id, set_id, learn_priority)
    SELECT v_sets.user_id, v_sets.id, 1
    ON CONFLICT (user_id, set_id) DO NOTHING;
  END LOOP;
END $$;

-- 4) Get priority for a user/set ---------------------------------------------
CREATE OR REPLACE FUNCTION public.get_set_learn_priority(
    p_user_id uuid,
    p_set_id uuid
)
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (SELECT learn_priority
       FROM public.user_set_learn_priority
      WHERE user_id = p_user_id
        AND set_id = p_set_id),
    1
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_set_learn_priority(uuid, uuid)
  TO anon, authenticated, service_role;

-- 5) Get all sets with priority for a user -----------------------------------
CREATE OR REPLACE FUNCTION public.get_user_set_learn_priorities(p_user_id uuid)
RETURNS TABLE (set_id uuid, learn_priority integer)
LANGUAGE sql
STABLE
AS $$
  SELECT set_id, learn_priority
  FROM public.user_set_learn_priority
  WHERE user_id = p_user_id
  ORDER BY learn_priority ASC, set_id ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_set_learn_priorities(uuid)
  TO anon, authenticated, service_role;