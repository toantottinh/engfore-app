-- EngFore Database Schema
-- Version: 1.1
-- Author: Gemini Code Assist

-- -------------------------------------------------
-- 1. EXTENSIONS & HELPER FUNCTIONS
-- -------------------------------------------------

-- Helper function to automatically update `updated_at` columns
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';


-- -------------------------------------------------
-- 2. TABLES
-- -------------------------------------------------

-- Table to store unique word strings.
CREATE TABLE public.words (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    word TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Comments
COMMENT ON TABLE public.words IS 'Stores unique word strings as canonical entries.';
COMMENT ON COLUMN public.words.word IS 'The vocabulary word string.';

-- Table to store the different senses (meanings) of a word.
CREATE TABLE public.word_senses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    word_id UUID NOT NULL REFERENCES public.words(id) ON DELETE CASCADE,
    ipa TEXT,
    word_type TEXT,
    meaning TEXT,
    example TEXT,
    description TEXT,
    cefr TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Comments
COMMENT ON TABLE public.word_senses IS 'Stores the different meanings, pronunciations, and examples for a word.';
COMMENT ON COLUMN public.word_senses.word_id IS 'Foreign key to the word string this sense belongs to.';

-- Table to store user-created vocabulary sets.
CREATE TABLE public.vocabulary_sets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Comments
COMMENT ON TABLE public.vocabulary_sets IS 'Stores user-created collections of vocabulary words.';
COMMENT ON COLUMN public.vocabulary_sets.user_id IS 'Foreign key to the user who owns the set.';

-- Junction table to link words to vocabulary sets (many-to-many relationship).
CREATE TABLE public.set_words (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    set_id UUID NOT NULL REFERENCES public.vocabulary_sets(id) ON DELETE CASCADE,
    word_id UUID NOT NULL REFERENCES public.words(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_set_word UNIQUE (set_id, word_id)
);

-- Comments
COMMENT ON TABLE public.set_words IS 'Junction table linking words to sets, creating a many-to-many relationship.';

-- Table to track each user's progress with each word sense.
CREATE TABLE public.user_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    sense_id UUID NOT NULL REFERENCES public.word_senses(id) ON DELETE CASCADE,
    mastery INTEGER NOT NULL DEFAULT 0 CHECK (mastery >= 0 AND mastery <= 100),
    correct_count INTEGER NOT NULL DEFAULT 0,
    wrong_count INTEGER NOT NULL DEFAULT 0,
    review_due TIMESTAMPTZ,
    last_review TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_user_sense_progress UNIQUE (user_id, sense_id)
);

-- Comments
COMMENT ON TABLE public.user_progress IS 'Tracks an individual user''s learning progress for a specific word sense.';
COMMENT ON COLUMN public.user_progress.mastery IS 'A percentage representing the user''s mastery of the word sense (0-100).';


-- -------------------------------------------------
-- 3. INDEXES
-- -------------------------------------------------

-- Indexes for foreign keys and common query patterns.
CREATE INDEX ON public.word_senses (word_id);
CREATE INDEX ON public.vocabulary_sets (user_id);
CREATE INDEX ON public.set_words (set_id);
CREATE INDEX ON public.set_words (word_id);
CREATE INDEX ON public.user_progress (user_id);
CREATE INDEX ON public.user_progress (sense_id);
CREATE INDEX ON public.user_progress (user_id, review_due);


-- -------------------------------------------------
-- 4. TRIGGERS
-- -------------------------------------------------

-- Triggers to automatically update the `updated_at` timestamp.
CREATE TRIGGER handle_vocabulary_sets_updated_at BEFORE UPDATE ON public.vocabulary_sets
  FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();

CREATE TRIGGER handle_user_progress_updated_at BEFORE UPDATE ON public.user_progress
  FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();


-- -------------------------------------------------
-- 5. ROW LEVEL SECURITY (RLS)
-- -------------------------------------------------

-- Enable RLS for all tables.
ALTER TABLE public.words ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.word_senses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vocabulary_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.set_words ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_progress ENABLE ROW LEVEL SECURITY;

-- --- RLS Policies ---

-- Policy for `vocabulary_sets`: Users can only manage their own sets.
CREATE POLICY "Users can manage their own vocabulary sets"
ON public.vocabulary_sets FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policy for `words` and `word_senses`: Authenticated users can read all words/senses, but cannot modify them.
CREATE POLICY "Authenticated users can read all words"
ON public.words FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can read all word senses"
ON public.word_senses FOR SELECT
USING (auth.role() = 'authenticated');

-- Policy for `set_words`: Users can only manage links for sets they own.
CREATE POLICY "Users can manage words in their own sets"
ON public.set_words FOR ALL
USING (
    (SELECT user_id FROM public.vocabulary_sets WHERE id = set_id) = auth.uid()
);

-- Policy for `user_progress`: Users can only manage their own progress records.
CREATE POLICY "Users can manage their own progress"
ON public.user_progress FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);