-- =====================================================================
-- PHASE 3: Add foreign key for last_viewed_version_id
-- =====================================================================
-- This must run AFTER vocabulary_versions table is created to avoid FK violation.

BEGIN;

-- Add FK constraint for last_viewed_version_id
-- ON DELETE SET NULL: if version is deleted, clear the reference
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'vocabulary_items_last_viewed_version_id_fkey'
    ) THEN
        ALTER TABLE public.vocabulary_items
        ADD CONSTRAINT vocabulary_items_last_viewed_version_id_fkey
        FOREIGN KEY (last_viewed_version_id) 
        REFERENCES public.vocabulary_versions(id) 
        ON DELETE SET NULL;
    END IF;
END
$$;

-- Index for last viewed lookups
CREATE INDEX IF NOT EXISTS vocabulary_items_last_viewed_idx 
ON vocabulary_items (user_id, last_viewed_version_id) 
WHERE last_viewed_version_id IS NOT NULL;

COMMIT;

