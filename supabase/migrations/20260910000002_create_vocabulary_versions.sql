-- =====================================================================
-- PHASE 3: Create vocabulary_versions table
-- =====================================================================
-- This table represents contextual instances of vocabulary items.
-- Each version has independent SRS and context data (example, memory_clue, etc.)

BEGIN;

-- Create vocabulary_versions table
CREATE TABLE IF NOT EXISTS public.vocabulary_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vocabulary_item_id UUID NOT NULL REFERENCES vocabulary_items(id) ON DELETE CASCADE,
    
    -- Context data (user-owned, per-version)
    description TEXT,
    example TEXT,
    memory_clue TEXT,
    cefr_level public.cefr_level,
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    -- Last viewed tracking (first view only - not overwritten)
    last_viewed_at TIMESTAMPTZ NULL
);

-- Critical index: Main Version lookup (oldest version per item)
CREATE INDEX IF NOT EXISTS vocabulary_versions_item_created_idx 
ON vocabulary_versions (vocabulary_item_id, created_at ASC, id ASC);

-- Unique (id, vocabulary_item_id): required as the composite-FK reference
-- target for version_sets so the DB itself enforces that
-- version_sets.vocabulary_item_id == vocabulary_versions.vocabulary_item_id.
-- (id is already PK; this adds the composite target for the FK.)
CREATE UNIQUE INDEX IF NOT EXISTS vocabulary_versions_id_item_key
ON vocabulary_versions (id, vocabulary_item_id);

-- Index for last viewed queries
CREATE INDEX IF NOT EXISTS vocabulary_versions_last_viewed_idx 
ON vocabulary_versions (last_viewed_at) 
WHERE last_viewed_at IS NOT NULL;

-- Grant permissions
GRANT ALL ON public.vocabulary_versions TO authenticated, service_role;

-- RLS
ALTER TABLE public.vocabulary_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage versions of their own items"
ON public.vocabulary_versions FOR ALL
USING (
    vocabulary_item_id IN (
        SELECT id FROM vocabulary_items WHERE user_id = auth.uid()
    )
)
WITH CHECK (
    vocabulary_item_id IN (
        SELECT id FROM vocabulary_items WHERE user_id = auth.uid()
    )
);

COMMIT;

