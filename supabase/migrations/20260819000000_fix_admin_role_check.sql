-- EngFore - Migration: Finalize Admin Role Check
-- This migration provides the definitive implementation of the is_admin() function.
-- It ensures the check is performed securely against the `public.users.role` column,
-- which is the single source of truth for authorization.
-- This script supersedes any previous definitions of is_admin().

-- Step 1: Drop the RLS policies that depend on the old is_admin() function.
DROP POLICY IF EXISTS "Admins can manage all vocabulary sets." ON public.vocabulary_sets;
DROP POLICY IF EXISTS "Admins can manage all topics." ON public.topics;
DROP POLICY IF EXISTS "Admins can manage all words." ON public.words;
DROP POLICY IF EXISTS "Admins can manage all word senses." ON public.word_senses;

-- Step 2: Drop the old, incorrect functions.
DROP FUNCTION IF EXISTS public.get_user_role(uuid);
DROP FUNCTION IF EXISTS public.is_admin(uuid);
DROP FUNCTION IF EXISTS public.is_admin();

-- Step 3: Create the definitive is_admin() function.
-- It checks public.users.role and runs with SECURITY DEFINER privileges.
CREATE OR REPLACE FUNCTION public.is_admin(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    is_admin_role boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM users
        WHERE id = p_user_id AND role = 'admin'::user_role
    ) INTO is_admin_role;
    RETURN COALESCE(is_admin_role, FALSE);
END;
$$;

-- Grant necessary execute permissions.
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO service_role;

-- Step 4: Re-create the RLS policies, now linked to the new is_admin() function.
CREATE POLICY "Admins can manage all vocabulary sets."
ON public.vocabulary_sets FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Admins can manage all topics."
ON public.topics FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Admins can manage all words."
ON public.words FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Admins can manage all word senses."
ON public.word_senses FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());


-- Step 5: Re-grant permissions for RPCs that use is_admin()
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.admin_import_words(jsonb, uuid, text, uuid, content_status) TO authenticated;
EXCEPTION
  WHEN UNDEFINED_FUNCTION THEN
    -- Ignore if the function doesn't exist yet
END; $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.admin_update_word(uuid, uuid, jsonb) TO authenticated;
EXCEPTION
  WHEN UNDEFINED_FUNCTION THEN
    -- Ignore if the function doesn't exist yet
END; $$;
