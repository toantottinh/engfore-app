-- =====================================================================
-- Unified Learn Engine: auto-create set learn_priority when a new set is made
--
-- Backs the JS-side default in createVocabularySet so that sets created via
-- ANY path (UI, admin import, seed, direct SQL) get a user_set_learn_priority
-- entry that places them at the END of the user's learning order.
--
-- Lower learn_priority = learned first.  A brand-new set that the user has
-- not reordered yet should never jump ahead of sets they already prioritized.
--=====================================================================

CREATE OR REPLACE FUNCTION public.ensure_set_learn_priority_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    INSERT INTO public.user_set_learn_priority (user_id, set_id, learn_priority)
    VALUES (
      NEW.user_id,
      NEW.id,
      COALESCE((
        SELECT MAX(learn_priority) + 1
        FROM public.user_set_learn_priority
        WHERE user_id = NEW.user_id
      ), 1)
    )
    ON CONFLICT (user_id, set_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_set_learn_priority_on_insert
  ON public.vocabulary_sets;

CREATE TRIGGER trg_ensure_set_learn_priority_on_insert
  AFTER INSERT ON public.vocabulary_sets
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_set_learn_priority_on_insert();

GRANT EXECUTE ON FUNCTION public.ensure_set_learn_priority_on_insert()
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.ensure_set_learn_priority_on_insert() IS
  'After inserting a vocabulary_set, create a default user_set_learn_priority '
  'entry at the end of the user'"'"'s ordering so NEW words from the new set are '
  'not prioritized before sets the user has already ordered.';

-- =====================================================================
-- Backfill: ensure EVERY existing set has a user_set_learn_priority record.
--
-- The AFTER INSERT trigger above only covers sets created after this
-- migration.  The earlier 20260824000000 migration already backfilled sets
-- that existed at that time (priority = 1).  This defensive backfill covers
-- any gap — e.g. sets created between that migration and now, or any set the
-- earlier backfill missed — and:
--   * never creates duplicates (ON CONFLICT DO NOTHING);
--   * never touches sets that already have a priority;
--   * preserves each user's existing relative order (created_at ASC);
--   * runs as the migration role which bypasses RLS (no RLS side effects).
-- =====================================================================
DO $$
DECLARE
  v_set     RECORD;
  v_next_p  INTEGER;
BEGIN
  FOR v_set IN
    SELECT s.id, s.user_id, s.created_at
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
      INTO v_next_p
      FROM public.user_set_learn_priority
     WHERE user_id = v_set.user_id;

    INSERT INTO public.user_set_learn_priority (user_id, set_id, learn_priority)
    VALUES (v_set.user_id, v_set.id, v_next_p)
    ON CONFLICT (user_id, set_id) DO NOTHING;
  END LOOP;
END $$;