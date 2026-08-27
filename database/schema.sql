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

/* --- Daily NEW limit settings --- */

/* Table: user_settings
   Per-user persistent settings stored as key/value_jsonb.
   Each row: (user_id, key, value_jsonb).
   The daily_new_limit setting lives here.
*/
CREATE TABLE user_settings (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  key TEXT NOT NULL,
  value_jsonb JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (user_id, key)
);

/* RLS for user_settings */
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own settings."
  ON user_settings FOR ALL USING (auth.uid() = user_id);

/* Table: daily_new_progress
   Tracks which NEW word_sense_ids a user has already introduced today.
   One row per (user, day, word_sense_id) — upsert is idempotent.
*/
CREATE TABLE daily_new_progress (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  day TEXT NOT NULL,               -- UTC date key "YYYY-MM-DD"
  word_sense_id UUID NOT NULL,
  PRIMARY KEY (user_id, day, word_sense_id)
);

/* RLS for daily_new_progress */
ALTER TABLE daily_new_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own daily new progress."
  ON daily_new_progress FOR ALL USING (auth.uid() = user_id);

/* Add indexes for performance */
CREATE INDEX ON user_settings (user_id);
CREATE INDEX ON daily_new_progress (user_id);
CREATE INDEX ON daily_new_progress (day);

/* --- Daily NEW STRUCTURE limit (mirror cho Sentence Structures) --- */

/*
   Table: daily_new_structure_progress
   Tracks which NEW structure_ids a user has already introduced today.
   One row per (user, day, structure_id) — upsert is idempotent.
   The `day` column stores the Vietnam business date key "YYYY-MM-DD"
   (Asia/Ho_Chi_Minh) like daily_new_progress since migration
   20260822_fix_daily_progress_timezone; mirror table created in
   20260827_add_daily_new_structure_progress.
*/
CREATE TABLE IF NOT EXISTS daily_new_structure_progress (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  day TEXT NOT NULL CHECK (day ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'), -- business date key Asia/Ho_Chi_Minh
  structure_id UUID NOT NULL,
  PRIMARY KEY (user_id, day, structure_id)
);

/* RLS for daily_new_structure_progress */
ALTER TABLE daily_new_structure_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own daily new structure progress."
  ON daily_new_structure_progress FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

/* Indexes for performance */
CREATE INDEX IF NOT EXISTS daily_new_structure_progress_user_id_idx
  ON daily_new_structure_progress (user_id);
CREATE INDEX IF NOT EXISTS daily_new_structure_progress_day_idx
  ON daily_new_structure_progress (day);
