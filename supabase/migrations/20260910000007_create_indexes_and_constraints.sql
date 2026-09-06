-- =====================================================================
-- PHASE 3: Create additional indexes for new schema
-- =====================================================================
-- These indexes optimize common queries on the new schema.

BEGIN;

-- =====================================================================
-- VOCABULARY ITEMS INDEXES
-- =====================================================================

-- Primary lookup: user's vocabulary items
CREATE INDEX IF NOT EXISTS idx_vocabulary_items_user_lookup 
ON public.vocabulary_items (user_id, word, word_type, meaning);

-- Lookup by global sense (for migration verification)
CREATE INDEX IF NOT EXISTS idx_vocabulary_items_sense_lookup 
ON public.vocabulary_items (word_sense_id, user_id) 
WHERE word_sense_id IS NOT NULL;

-- =====================================================================
-- VOCABULARY VERSIONS INDEXES
-- =====================================================================

-- Main Version lookup (already created in 20260910000002, but ensure it exists)
CREATE INDEX IF NOT EXISTS idx_versions_item_created_main 
ON public.vocabulary_versions (vocabulary_item_id, created_at ASC, id ASC);

-- Last viewed queries
CREATE INDEX IF NOT EXISTS idx_versions_last_viewed_lookup 
ON public.vocabulary_versions (vocabulary_item_id, last_viewed_at) 
WHERE last_viewed_at IS NOT NULL;

-- =====================================================================
-- VERSION SETS INDEXES
-- =====================================================================

-- Set contents lookup
CREATE INDEX IF NOT EXISTS idx_version_sets_set_lookup 
ON public.version_sets (set_id, vocabulary_item_id);

-- Version's sets lookup
CREATE INDEX IF NOT EXISTS idx_version_sets_version_lookup 
ON public.version_sets (version_id, set_id);

-- =====================================================================
-- USER PROGRESS INDEXES
-- =====================================================================

-- SRS queue: due cards by version
CREATE INDEX IF NOT EXISTS idx_user_progress_version_due 
ON public.user_progress (user_id, review_due_at) 
WHERE version_id IS NOT NULL 
AND state IN ('review', 'learning', 'relearning');

-- Version's progress lookup
CREATE INDEX IF NOT EXISTS idx_user_progress_version_lookup 
ON public.user_progress (user_id, version_id) 
WHERE version_id IS NOT NULL;

-- =====================================================================
-- COMPOSITE INDEXES FOR COMMON JOINS
-- =====================================================================

-- Vocabulary list with progress
CREATE INDEX IF NOT EXISTS idx_vi_versions_join 
ON public.vocabulary_versions (vocabulary_item_id, id);

-- Set detail with versions
CREATE INDEX IF NOT EXISTS idx_vs_versions_join 
ON public.version_sets (set_id, version_id);

COMMIT;

