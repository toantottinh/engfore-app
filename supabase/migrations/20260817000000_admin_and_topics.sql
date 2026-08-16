-- EngFore - Migration 1: Admin Role, Topics, and Public Sets
-- This migration introduces the core structures for content management.

-- 1. Create a custom type for user roles for consistency.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('user', 'admin');
    END IF;
END$$;

-- 2. Add a 'role' column to the 'users' table.
-- It defaults to 'user'. Admins must be updated manually.
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS role user_role NOT NULL DEFAULT 'user';

-- 3. Create the 'topics' table for organizing vocabulary sets.
CREATE TABLE IF NOT EXISTS public.topics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    cefr_level TEXT, -- e.g., 'A1', 'B2'
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_topics_cefr_level ON public.topics(cefr_level);

-- 4. Modify 'vocabulary_sets' to support public content and link to topics.
--    a. Make 'user_id' nullable. If NULL, it's a public/official set.
ALTER TABLE public.vocabulary_sets
ALTER COLUMN user_id DROP NOT NULL;

--    b. Add 'topic_id' foreign key.
ALTER TABLE public.vocabulary_sets
ADD COLUMN IF NOT EXISTS topic_id UUID REFERENCES public.topics(id) ON DELETE SET NULL;

--    c. Add a 'status' for publishing workflow.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'content_status') THEN
        CREATE TYPE content_status AS ENUM ('draft', 'published');
    END IF;
END$$;

ALTER TABLE public.vocabulary_sets
ADD COLUMN IF NOT EXISTS status content_status NOT NULL DEFAULT 'draft';

-- Make 'name' unique for public sets to avoid confusion.
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_public_set_name ON public.vocabulary_sets(name) WHERE user_id IS NULL;


-- 5. UPDATE RLS POLICIES to grant permissions
--    This is the most critical part.

-- === vocabulary_sets ===
-- Drop existing policies to redefine them.
DROP POLICY IF EXISTS "Users can view their own vocabulary sets." ON public.vocabulary_sets;
DROP POLICY IF EXISTS "Users can insert their own vocabulary sets." ON public.vocabulary_sets;
DROP POLICY IF EXISTS "Users can update their own vocabulary sets." ON public.vocabulary_sets;
DROP POLICY IF EXISTS "Users can delete their own vocabulary sets." ON public.vocabulary_sets;

-- New SELECT Policy: Users can see their own sets OR any 'published' public sets.
CREATE POLICY "Users can view their own sets and published public sets."
ON public.vocabulary_sets
FOR SELECT USING (
    (auth.uid() = user_id) OR
    (user_id IS NULL AND status = 'published'::content_status)
);

-- New INSERT Policy: Users can insert their own sets.
CREATE POLICY "Users can insert their own vocabulary sets."
ON public.vocabulary_sets
FOR INSERT WITH CHECK (
    auth.uid() = user_id
);

-- New UPDATE Policy: Users can update their own sets.
CREATE POLICY "Users can update their own vocabulary sets."
ON public.vocabulary_sets
FOR UPDATE USING (
    auth.uid() = user_id
);

-- New DELETE Policy: Users can delete their own sets.
CREATE POLICY "Users can delete their own vocabulary sets."
ON public.vocabulary_sets
FOR DELETE USING (
    auth.uid() = user_id
);

-- ADMIN Policy for sets: Admins can do anything.
CREATE POLICY "Admins can manage all vocabulary sets."
ON public.vocabulary_sets
FOR ALL USING (
    (SELECT role FROM public.users WHERE id = auth.uid()) = 'admin'::user_role
) WITH CHECK (
    (SELECT role FROM public.users WHERE id = auth.uid()) = 'admin'::user_role
);


-- === topics ===
ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;
-- SELECT: Any authenticated user can see topics.
CREATE POLICY "Authenticated users can view topics."
ON public.topics
FOR SELECT USING (
    auth.role() = 'authenticated'
);
-- ADMIN: Admins can manage all topics.
CREATE POLICY "Admins can manage all topics."
ON public.topics
FOR ALL USING (
    (SELECT role FROM public.users WHERE id = auth.uid()) = 'admin'::user_role
);

-- === words & word_senses ===
-- The goal is to allow admins to manage the global word list.
DROP POLICY IF EXISTS "Authenticated users can insert words." ON public.words;
DROP POLICY IF EXISTS "Authenticated users can insert word senses." ON public.word_senses;
DROP POLICY IF EXISTS "Authenticated users can update word senses." ON public.word_senses;

-- New policies for words/senses
CREATE POLICY "Admins can manage all words."
ON public.words
FOR ALL USING (
    (SELECT role FROM public.users WHERE id = auth.uid()) = 'admin'::user_role
);

CREATE POLICY "Admins can manage all word senses."
ON public.word_senses
FOR ALL USING (
    (SELECT role FROM public.users WHERE id = auth.uid()) = 'admin'::user_role
);

-- Allow SELECT for all users on words/senses (read-only access)
CREATE POLICY "All users can view words." ON words FOR SELECT USING (true);
CREATE POLICY "All users can view word senses." ON word_senses FOR SELECT USING (true);

-- The 'import_words' RPC runs with the user's permissions. We need to ensure
-- it can still work for regular users adding words to their personal vocabulary,
-- even if they can't directly INSERT into 'words' or 'word_senses'.
-- The function should be defined with `SECURITY DEFINER` if it needs to bypass RLS.
-- We will check the function definition later. This migration focuses on table RLS.
