-- =====================================================================
-- PHASE 3: Migrate user_progress to use version_id
-- =====================================================================
-- This migration:
-- 1. Adds version_id column to user_progress
-- 2. Migrates existing SRS data to Main Version
-- 3. Adds new unique constraint on (user_id, version_id)
-- 4. Makes version_id NOT NULL after migration

BEGIN;

-- Step 1: Add version_id column (nullable initially for migration)
ALTER TABLE public.user_progress 
ADD COLUMN IF NOT EXISTS version_id UUID NULL;

-- Step 2: Create index for migration performance
CREATE INDEX IF NOT EXISTS idx_user_progress_word_sense_migration 
ON public.user_progress (user_id, word_sense_id);

-- Step 3: Migrate existing SRS data to Main Version
-- For each user_progress row, find the Main Version (oldest) of the corresponding vocabulary item
UPDATE public.user_progress up
SET version_id = (
    SELECT vv.id 
    FROM public.vocabulary_versions vv
    JOIN public.vocabulary_items vi ON vv.vocabulary_item_id = vi.id
    WHERE vi.word_sense_id = up.word_sense_id 
    AND vi.user_id = up.user_id
    ORDER BY vv.created_at ASC, vv.id ASC 
    LIMIT 1
)
WHERE up.version_id IS NULL;

-- Step 4: Handle orphaned user_progress (no matching vocabulary_item)
-- These are edge cases - log them for manual review
DO $$
DECLARE
    v_orphaned_count INT;
BEGIN
    SELECT COUNT(*) INTO v_orphaned_count
    FROM public.user_progress
    WHERE version_id IS NULL;
    
    IF v_orphaned_count > 0 THEN
        RAISE NOTICE 'MIGRATION WARNING: % orphaned user_progress rows found (no matching vocabulary_item)', v_orphaned_count;
        -- Log orphaned rows for manual review
        CREATE TABLE IF NOT EXISTS public._migration_orphaned_progress AS
        SELECT up.*, now() as logged_at
        FROM public.user_progress up
        WHERE up.version_id IS NULL;
    END IF;
END
$$;

-- Step 5: Add unique constraint on (user_id, version_id)
-- First, handle any duplicates (keep one deterministic row per (user_id, version_id)).
-- NOTE: user_progress has NO `id` column (PK is (user_id, word_sense_id)),
-- so we dedupe via `ctid` + a deterministic ORDER BY on SRS recency.
DELETE FROM public.user_progress
WHERE version_id IS NOT NULL
  AND ctid NOT IN (
    SELECT DISTINCT ON (user_id, version_id) ctid
    FROM public.user_progress
    WHERE version_id IS NOT NULL
    ORDER BY user_id, version_id,
             last_reviewed_at DESC NULLS LAST,
             review_due_at DESC NULLS LAST,
             ctid
  );

-- Add unique index
CREATE UNIQUE INDEX IF NOT EXISTS user_progress_version_key 
ON public.user_progress (user_id, version_id) 
WHERE version_id IS NOT NULL;

-- Step 6: Add FK constraint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'user_progress_version_id_fkey'
    ) THEN
        ALTER TABLE public.user_progress
        ADD CONSTRAINT user_progress_version_id_fkey
        FOREIGN KEY (version_id) 
        REFERENCES public.vocabulary_versions(id) 
        ON DELETE CASCADE;
    END IF;
END
$$;

-- Step 7: Make version_id NOT NULL (after successful migration)
-- Only if no orphaned rows exist
DO $$
DECLARE
    v_null_count INT;
BEGIN
    SELECT COUNT(*) INTO v_null_count
    FROM public.user_progress
    WHERE version_id IS NULL;
    
    IF v_null_count = 0 THEN
        ALTER TABLE public.user_progress 
        ALTER COLUMN version_id SET NOT NULL;
        
        -- Drop old primary key and word_sense_id column
        -- Note: This is a destructive operation - only do this after verification
        -- For now, keep both columns and use version_id as the primary reference
    END IF;
END
$$;

-- Step 8: Update primary key reference
-- The logical PK is now (user_id, version_id) but we keep the old PK for backward compatibility
-- Frontend/backend will be updated in Phase 4 to use version_id

COMMIT;

