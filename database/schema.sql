-- Create vocabulary_sets table
CREATE TABLE vocabulary_sets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
-- RLS for vocabulary_sets
ALTER TABLE vocabulary_sets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own vocabulary sets." ON vocabulary_sets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own vocabulary sets." ON vocabulary_sets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own vocabulary sets." ON vocabulary_sets FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own vocabulary sets." ON vocabulary_sets FOR DELETE USING (auth.uid() = user_id);

-- Create words table
CREATE TABLE words (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    word TEXT NOT NULL UNIQUE,
    ipa TEXT,
    cefr_level TEXT
);
-- Public read access for words
ALTER TABLE words ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All users can view words." ON words FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert words." ON words FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Create word_senses table
CREATE TABLE word_senses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    word_id UUID REFERENCES words(id) ON DELETE CASCADE NOT NULL,
    word_type TEXT,
    meaning TEXT NOT NULL,
    example TEXT,
    description TEXT
);
-- Public read access for word_senses
ALTER TABLE word_senses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All users can view word senses." ON word_senses FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert word senses." ON word_senses FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can update word senses." ON word_senses FOR UPDATE USING (auth.role() = 'authenticated');


-- Create vocabulary_set_words join table
CREATE TABLE vocabulary_set_words (
    set_id UUID REFERENCES vocabulary_sets(id) ON DELETE CASCADE NOT NULL,
    sense_id UUID REFERENCES word_senses(id) ON DELETE CASCADE NOT NULL,
    PRIMARY KEY (set_id, sense_id)
);
-- RLS for vocabulary_set_words
ALTER TABLE vocabulary_set_words ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage words in their own sets." ON vocabulary_set_words
    FOR ALL
    USING (
        (SELECT user_id FROM vocabulary_sets WHERE id = set_id) = auth.uid()
    );

-- Create user_progress table
-- KHỚP VỚI SCHEMA PRODUCTION THỰC TẾ (audit 2026-08-09 qua PostgREST):
--   user_id, word_sense_id, mastery_level, review_due_at, last_reviewed_at
-- KHÔNG được chạy lại toàn bộ file này lên production (production đã có schema chuẩn).
CREATE TABLE user_progress (
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    word_sense_id UUID REFERENCES word_senses(id) ON DELETE CASCADE NOT NULL,
    mastery_level INTEGER DEFAULT 0 NOT NULL,
    review_count INTEGER DEFAULT 0 NOT NULL,
    review_due_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    last_reviewed_at TIMESTAMPTZ,
    PRIMARY KEY (user_id, word_sense_id)
);
-- RLS for user_progress
ALTER TABLE user_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own progress." ON user_progress FOR ALL USING (auth.uid() = user_id);

-- Add indexes for performance
CREATE INDEX ON vocabulary_sets (user_id);
CREATE INDEX ON word_senses (word_id);
CREATE INDEX ON vocabulary_set_words (sense_id);
CREATE INDEX ON user_progress (user_id, review_due_at);
