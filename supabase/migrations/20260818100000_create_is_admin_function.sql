-- EngFore - Migration 3: Create is_admin() helper and harden policies
-- This migration introduces a reusable SQL function to check for admin privileges
-- and refactors existing RLS policies to use it for clarity and maintainability.

-- 1. Create the is_admin() function
-- This function checks if a given user ID has the 'admin' role.
-- It defaults to the currently authenticated user.
-- It's defined with SECURITY INVOKER (the default) so it runs as the calling user.
CREATE OR REPLACE FUNCTION public.is_admin(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE -- Indicates the function cannot modify the database and is safe for read-only queries.
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = p_user_id AND role = 'admin'::user_role
  );
$$;

-- Grant execute permission to authenticated users so they can call it in RLS policies.
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO service_role;


-- 2. Refactor RLS policies to use the new is_admin() function

-- === vocabulary_sets ===
-- Drop the old admin policy
DROP POLICY IF EXISTS "Admins can manage all vocabulary sets." ON public.vocabulary_sets;

-- Re-create it using the helper function. This is much cleaner.
CREATE POLICY "Admins can manage all vocabulary sets."
ON public.vocabulary_sets
FOR ALL USING (public.is_admin())
WITH CHECK (public.is_admin());


-- === topics ===
-- Drop the old admin policy
DROP POLICY IF EXISTS "Admins can manage all topics." ON public.topics;

-- Re-create it using the helper function.
CREATE POLICY "Admins can manage all topics."
ON public.topics
FOR ALL USING (public.is_admin())
WITH CHECK (public.is_admin());


-- === words ===
-- Drop the old admin policy
DROP POLICY IF EXISTS "Admins can manage all words." ON public.words;

-- Re-create it using the helper function.
CREATE POLICY "Admins can manage all words."
ON public.words
FOR ALL USING (public.is_admin())
WITH CHECK (public.is_admin());


-- === word_senses ===
-- Drop the old admin policy
DROP POLICY IF EXISTS "Admins can manage all word senses." ON public.word_senses;

-- Re-create it using the helper function.
CREATE POLICY "Admins can manage all word senses."
ON public.word_senses
FOR ALL USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Note: The policies for regular users (e.g., "Users can view their own sets...")
-- remain unchanged and are not affected by this refactoring.
-- This migration solely focuses on improving the admin check.
