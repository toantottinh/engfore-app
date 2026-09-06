-- =====================================================================
-- PHASE 3: Create vocabulary_items table
-- =====================================================================
-- This table represents a user's knowledge of a word with specific meaning.
-- Identity: (user_id, normalized_word, word_type, normalized_meaning)

BEGIN;

-- Create vocabulary_items table
CREATE TABLE IF NOT EXISTS public.vocabulary_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Identity fields (user-owned snapshot)
    word TEXT NOT NULL,
    word_type public.word_type NOT NULL,
    meaning TEXT NOT NULL,
    
    -- Reference to global dictionary (optional, for enrichment)
    word_id UUID REFERENCES words(id) ON DELETE SET NULL,
    word_sense_id UUID REFERENCES word_senses(id) ON DELETE SET NULL,
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    -- Last viewed tracking (FK added in separate migration after vocabulary_versions created)
    last_viewed_version_id UUID NULL
);

-- Identity constraint: one item per (user, word, type, meaning)
CREATE UNIQUE INDEX IF NOT EXISTS vocabulary_items_identity_key 
ON vocabulary_items (
    user_id,
    lower(regexp_replace(trim(word), '\s+', ' ', 'g')),
    word_type,
    lower(regexp_replace(trim(meaning), '\s+', ' ', 'g'))
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS vocabulary_items_user_id_idx 
ON vocabulary_items (user_id);

CREATE INDEX IF NOT EXISTS vocabulary_items_word_sense_id_idx 
ON vocabulary_items (word_sense_id) 
WHERE word_sense_id IS NOT NULL;

-- Grant permissions
GRANT ALL ON public.vocabulary_items TO authenticated, service_role;

-- RLS
ALTER TABLE public.vocabulary_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own vocabulary items"
ON public.vocabulary_items FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

COMMIT;
