-- =====================================================================
-- PHASE 3: Create version_sets table
-- =====================================================================
-- This table links versions to vocabulary sets.
-- Constraint: One version per vocabulary item per set.

BEGIN;

-- Create version_sets table
CREATE TABLE IF NOT EXISTS public.version_sets (
    version_id UUID NOT NULL REFERENCES vocabulary_versions(id) ON DELETE CASCADE,
    set_id UUID NOT NULL REFERENCES vocabulary_sets(id) ON DELETE CASCADE,
    vocabulary_item_id UUID NOT NULL REFERENCES vocabulary_items(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    PRIMARY KEY (version_id, set_id)
);

-- Critical constraint: One version per item per set
-- This prevents multiple versions of the same item in the same set
CREATE UNIQUE INDEX IF NOT EXISTS version_sets_item_set_key 
ON version_sets (set_id, vocabulary_item_id);

-- Critical constraint: version_sets.vocabulary_item_id MUST equal
-- vocabulary_versions.vocabulary_item_id for the linked version.
-- The composite FK (version_id, vocabulary_item_id) -> vocabulary_versions(id, vocabulary_item_id)
-- makes PostgreSQL enforce this invariant at DB level (not only app logic).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'version_sets_version_item_consistency_fkey'
    ) THEN
        ALTER TABLE public.version_sets
        ADD CONSTRAINT version_sets_version_item_consistency_fkey
        FOREIGN KEY (version_id, vocabulary_item_id)
        REFERENCES public.vocabulary_versions(id, vocabulary_item_id)
        ON DELETE CASCADE;
    END IF;
END
$$;

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS version_sets_set_id_idx 
ON version_sets (set_id);

CREATE INDEX IF NOT EXISTS version_sets_version_id_idx 
ON version_sets (version_id);

CREATE INDEX IF NOT EXISTS version_sets_item_id_idx 
ON version_sets (vocabulary_item_id);

-- Grant permissions
GRANT ALL ON public.version_sets TO authenticated, service_role;

-- RLS
ALTER TABLE public.version_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage version-set links for their own data"
ON public.version_sets FOR ALL
USING (
    version_id IN (
        SELECT vv.id FROM vocabulary_versions vv
        JOIN vocabulary_items vi ON vv.vocabulary_item_id = vi.id
        WHERE vi.user_id = auth.uid()
    )
    AND set_id IN (
        SELECT id FROM vocabulary_sets WHERE user_id = auth.uid()
    )
)
WITH CHECK (
    version_id IN (
        SELECT vv.id FROM vocabulary_versions vv
        JOIN vocabulary_items vi ON vv.vocabulary_item_id = vi.id
        WHERE vi.user_id = auth.uid()
    )
    AND set_id IN (
        SELECT id FROM vocabulary_sets WHERE user_id = auth.uid()
    )
);

COMMIT;

