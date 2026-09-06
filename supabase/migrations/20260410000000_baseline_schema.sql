-- =====================================================================
-- BASELINE SCHEMA — EngFore pre-migration production schema
-- =====================================================================
--
-- MỤC ĐÍCH:
--   Reproduce schema gốc (tồn tại trên production/staging TRƯỚC khi các
--   migration trong supabase/migrations/ được tạo) để `supabase db reset`
--   có thể chạy migration chain trên DB trống.
--
-- EVIDENCE:
--   * staging_backup.sql (pg_dump staging 2026-08-10) — cấu trúc bảng,
--     enum, index, constraint, policies, functions, grants.
--   * Audit header migration 20260810200000_add_word_types.sql:
--     "enum public.word_type hiện chỉ có 8 giá trị: noun, verb, adjective,
--      adverb, preposition, conjunction, pronoun, other" → baseline tạo
--      word_type theo staging_backup.sql (12 giá trị, GỒM verb_phrase).
--
--   Vì sao baseline KHÔNG dùng trạng thái 8 giá trị:
--     Migration 20260903000000_fix_word_type_enum.sql chạy:
--       UPDATE public.word_senses SET word_type='other'
--       WHERE word_type = 'verb_phrase'::public.word_type;
--     PostgreSQL constant-fold literal 'verb_phrase' ngay khi parse → fail
--     (22P02) nếu enum chưa có verb_phrase, KỂ CẢ khi bảng rỗng.
--     Migration này chính nó ghi rõ: "Migration 20260810200000 added
--     'verb_phrase' to the word_type enum on the LIVE database" — tức chain
--     giả định verb_phrase ĐÃ tồn tại. File repo 20260810200000 hiện chỉ
--     chứa 3 ADD VALUE (determiner/interjection/phrasal_verb), thiếu
--     verb_phrase; không được sửa migration cũ → baseline phải cấp trạng
--     thái đầy đủ (khớp staging_backup.sql và root-cause của 20260903).
--     20260810200000 dùng ADD VALUE IF NOT EXISTS nên không xung đột;
--     20260903000000 sau đó recreate toàn bộ enum về 11 giá trị chuẩn.
--
-- PHẠM VI (nguyên tắc ownership):
--   Baseline CHỈ tạo object mà KHÔNG migration nào sẽ CREATE:
--     enums public.cefr_level / public.word_type,
--     tables public.users / words / word_senses / vocabulary_sets /
--            set_words / user_progress / push_subscriptions,
--     functions cũ (advanced_search_sets, get_distractors, get_mastery_stats,
--                 get_set_statistics, get_users_with_due_reviews, handle_new_user).
--   KHÔNG tạo: user_settings, daily_new_progress (migration 20260815000000),
--     user_vocabulary (20260816100000), topics/user_role/content_status
--     (20260817000000), daily_learning_log/daily_activity + các hàm daily
--     (20260822000000), structures/grammar (20260830000000/20260902000000),
--     vocabulary_items/vocabulary_versions/version_sets (Phase 3).
--   KHÔNG import dữ liệu (không INSERT/COPY application data).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Extensions (idempotent — giống staging_backup.sql)
--    uuid-ossp cần cho Phase 3 (uuid_generate_v4()).
-- ---------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";

-- ---------------------------------------------------------------------
-- 2) Enums
--    word_type: đầy đủ 12 giá trị theo staging_backup.sql (GỒM
--    verb_phrase) — xem header file. 20260903000000 sẽ recreate enum về
--    11 giá trị chuẩn sau khi merge dữ liệu cũ.
-- ---------------------------------------------------------------------
CREATE TYPE public.cefr_level AS ENUM ('A1', 'A2', 'B1', 'B2', 'C1', 'C2');

CREATE TYPE public.word_type AS ENUM (
    'noun',
    'verb',
    'adjective',
    'adverb',
    'preposition',
    'conjunction',
    'pronoun',
    'other',
    'determiner',
    'interjection',
    'phrasal_verb',
    'verb_phrase'
);

-- ---------------------------------------------------------------------
-- 3) public.users — profile mirror của auth.users
--    (20260817000000 sẽ ADD COLUMN role user_role)
-- ---------------------------------------------------------------------
CREATE TABLE public.users (
    id          uuid        NOT NULL,
    username    text,
    avatar_url  text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    daily_goal  integer     NOT NULL DEFAULT 20
);

ALTER TABLE public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);

ALTER TABLE public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);

ALTER TABLE public.users
    ADD CONSTRAINT users_id_fkey
    FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert or update their own profile."
    ON public.users
    USING (auth.uid() = id);

CREATE POLICY "Users can view all profiles."
    ON public.users
    FOR SELECT
    USING (true);

-- ---------------------------------------------------------------------
-- 4) public.words — từ điển chung
--    (20260816100000 sẽ drop words_word_key / words_word_idx và tạo
--      index unique lower(word))
-- ---------------------------------------------------------------------
CREATE TABLE public.words (
    id          uuid                PRIMARY KEY DEFAULT gen_random_uuid(),
    word        text                NOT NULL,
    ipa         text,
    cefr_level  public.cefr_level
);

ALTER TABLE public.words
    ADD CONSTRAINT words_word_key UNIQUE (word);

CREATE INDEX words_word_idx ON public.words USING btree (word);

ALTER TABLE public.words ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can insert words and senses."
    ON public.words
    FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can view all words and senses."
    ON public.words
    FOR SELECT
    USING (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------
-- 5) public.word_senses — nghĩa của từ (word_type NOT NULL enum)
--    (20260903000000 sẽ swap word_type → enum 11 giá trị mới)
-- ---------------------------------------------------------------------
CREATE TABLE public.word_senses (
    id           uuid                PRIMARY KEY DEFAULT gen_random_uuid(),
    word_id      uuid                NOT NULL,
    word_type    public.word_type    NOT NULL,
    meaning      text                NOT NULL,
    description  text,
    example      text
);

ALTER TABLE public.word_senses
    ADD CONSTRAINT word_senses_word_id_fkey
    FOREIGN KEY (word_id) REFERENCES public.words(id) ON DELETE CASCADE;

CREATE INDEX word_senses_word_id_idx ON public.word_senses USING btree (word_id);

ALTER TABLE public.word_senses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can insert words and senses."
    ON public.word_senses
    FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can view all words and senses."
    ON public.word_senses
    FOR SELECT
    USING (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------
-- 6) public.vocabulary_sets
--    (20260817000000 sẽ làm user_id nullable + thêm topic_id/status)
-- ---------------------------------------------------------------------
CREATE TABLE public.vocabulary_sets (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid        NOT NULL,
    name        text        NOT NULL,
    description text,
    created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vocabulary_sets
    ADD CONSTRAINT vocabulary_sets_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

CREATE INDEX vocabulary_sets_user_id_idx
    ON public.vocabulary_sets USING btree (user_id);

CREATE INDEX vocabulary_sets_user_id_name_idx
    ON public.vocabulary_sets USING btree (user_id, name);

ALTER TABLE public.vocabulary_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only manage their own vocabulary sets."
    ON public.vocabulary_sets
    USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- 7) public.set_words — junction set ↔ sense
-- ---------------------------------------------------------------------
CREATE TABLE public.set_words (
    set_id         uuid NOT NULL,
    word_sense_id  uuid NOT NULL
);

ALTER TABLE public.set_words
    ADD CONSTRAINT set_words_pkey PRIMARY KEY (set_id, word_sense_id);

ALTER TABLE public.set_words
    ADD CONSTRAINT set_words_set_id_fkey
    FOREIGN KEY (set_id) REFERENCES public.vocabulary_sets(id) ON DELETE CASCADE;

ALTER TABLE public.set_words
    ADD CONSTRAINT set_words_word_sense_id_fkey
    FOREIGN KEY (word_sense_id) REFERENCES public.word_senses(id) ON DELETE CASCADE;

CREATE INDEX set_words_set_id_idx ON public.set_words USING btree (set_id);
CREATE INDEX set_words_word_sense_id_idx ON public.set_words USING btree (word_sense_id);

ALTER TABLE public.set_words ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only manage words within their own sets."
    ON public.set_words
    USING (
        (SELECT vocabulary_sets.user_id
           FROM public.vocabulary_sets
          WHERE vocabulary_sets.id = set_words.set_id) = auth.uid()
    );

-- ---------------------------------------------------------------------
-- 8) public.user_progress — SRS per (user, sense)
--    LƯU Ý: constraint user_progress_word_sense_id_fkey PHẢI tồn tại —
--    migration 20260816100000 gọi DROP CONSTRAINT bởi tên (không IF EXISTS)
--    rồi re-add với ON DELETE RESTRICT.
--    (20260811100000/12000000 sẽ thêm SRS columns; Phase 3 sẽ thêm version_id)
-- ---------------------------------------------------------------------
CREATE TABLE public.user_progress (
    user_id          uuid        NOT NULL,
    word_sense_id    uuid        NOT NULL,
    mastery_level    integer     NOT NULL DEFAULT 0,
    review_due_at    timestamptz NOT NULL DEFAULT now(),
    last_reviewed_at timestamptz
);

ALTER TABLE public.user_progress
    ADD CONSTRAINT user_progress_pkey PRIMARY KEY (user_id, word_sense_id);

ALTER TABLE public.user_progress
    ADD CONSTRAINT user_progress_mastery_level_check
    CHECK ((mastery_level >= 0) AND (mastery_level <= 5));

ALTER TABLE public.user_progress
    ADD CONSTRAINT user_progress_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE public.user_progress
    ADD CONSTRAINT user_progress_word_sense_id_fkey
    FOREIGN KEY (word_sense_id) REFERENCES public.word_senses(id) ON DELETE CASCADE;

CREATE INDEX user_progress_user_id_idx
    ON public.user_progress USING btree (user_id);

CREATE INDEX user_progress_user_id_review_due_at_idx
    ON public.user_progress USING btree (user_id, review_due_at);

CREATE INDEX user_progress_word_sense_id_idx
    ON public.user_progress USING btree (word_sense_id);

ALTER TABLE public.user_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only manage their own learning progress."
    ON public.user_progress
    USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- 9) public.push_subscriptions — push notification subscriptions
--    (không migration nào động tới; baseline giữ nguyên schema production)
-- ---------------------------------------------------------------------
CREATE TABLE public.push_subscriptions (
    endpoint             text        PRIMARY KEY,
    subscription_details jsonb       NOT NULL,
    user_id              uuid        NOT NULL,
    created_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 10) Functions legacy (từ staging_backup.sql) — được 20260822000000
--     CREATE OR REPLACE sau này cho phiên bản business-date.
--     Các hàm này tồn tại trong schema production từ trước migration.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.advanced_search_sets(
    p_user_id uuid,
    p_name_query text DEFAULT NULL::text,
    p_contains_word text DEFAULT NULL::text,
    p_created_after date DEFAULT NULL::date,
    p_created_before date DEFAULT NULL::date,
    p_sort_by text DEFAULT 'created_at'::text,
    p_sort_order_asc boolean DEFAULT false
)
RETURNS SETOF public.vocabulary_sets
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT vs.*
  FROM public.vocabulary_sets vs
  WHERE
    vs.user_id = p_user_id
    AND (p_name_query IS NULL OR vs.name ILIKE ('%' || p_name_query || '%'))
    AND (p_created_after IS NULL OR vs.created_at::date >= p_created_after)
    AND (p_created_before IS NULL OR vs.created_at::date <= p_created_before)
    AND (p_contains_word IS NULL OR EXISTS (
        SELECT 1
        FROM public.set_words sw
        JOIN public.word_senses ws ON sw.word_sense_id = ws.id
        JOIN public.words w ON ws.word_id = w.id
        WHERE sw.set_id = vs.id AND w.word ILIKE ('%' || p_contains_word || '%')
      ))
  ORDER BY
    CASE WHEN p_sort_by = 'name' AND p_sort_order_asc = true THEN vs.name END ASC,
    CASE WHEN p_sort_by = 'name' AND p_sort_order_asc = false THEN vs.name END DESC,
    CASE WHEN p_sort_by = 'created_at' AND p_sort_order_asc = true THEN vs.created_at END ASC,
    CASE WHEN p_sort_by = 'created_at' AND p_sort_order_asc = false THEN vs.created_at END DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_distractors(
    p_set_id uuid,
    p_exclude_sense_id uuid,
    p_limit integer
)
RETURNS TABLE(id uuid, meaning text)
LANGUAGE sql
AS $$
  SELECT ws.id, ws.meaning
  FROM public.word_senses ws
  JOIN public.set_words sw ON ws.id = sw.word_sense_id
  WHERE sw.set_id = p_set_id AND ws.id != p_exclude_sense_id
  ORDER BY random()
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION public.get_mastery_stats(p_user_id uuid)
RETURNS TABLE(mastery_level integer, word_count bigint)
LANGUAGE sql
AS $$
  SELECT up.mastery_level, count(*) AS word_count
  FROM public.user_progress up
  WHERE up.user_id = p_user_id
  GROUP BY up.mastery_level;
$$;

CREATE OR REPLACE FUNCTION public.get_set_statistics(p_set_id uuid, p_user_id uuid)
RETURNS TABLE(mastery_level integer, word_count bigint)
LANGUAGE sql
AS $$
  SELECT COALESCE(up.mastery_level, 0) AS mastery_level, count(*) AS word_count
  FROM public.set_words sw
  LEFT JOIN public.user_progress up
         ON sw.word_sense_id = up.word_sense_id AND up.user_id = p_user_id
  WHERE sw.set_id = p_set_id
  GROUP BY COALESCE(up.mastery_level, 0)
  ORDER BY mastery_level;
$$;

CREATE OR REPLACE FUNCTION public.get_users_with_due_reviews()
RETURNS TABLE(user_id uuid, review_count bigint)
LANGUAGE sql
AS $$
  SELECT up.user_id, count(*) AS review_count
  FROM public.user_progress up
  WHERE up.review_due_at <= now()
  GROUP BY up.user_id;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, username)
  VALUES (new.id, new.raw_user_meta_data->>'username');
  RETURN new;
END;
$$;

-- ---------------------------------------------------------------------
-- 11) Grants (mirror staging_backup.sql) — role mở object theo đúng
--     schema production, RLS là lớp enforcement.
-- ---------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT ALL ON TABLE public.users TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.words TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.word_senses TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.vocabulary_sets TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.set_words TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.user_progress TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.push_subscriptions TO anon, authenticated, service_role;

GRANT ALL ON FUNCTION public.advanced_search_sets(uuid, text, text, date, date, text, boolean)
    TO anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.get_distractors(uuid, uuid, integer)
    TO anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.get_mastery_stats(uuid)
    TO anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.get_set_statistics(uuid, uuid)
    TO anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.get_users_with_due_reviews()
    TO anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.handle_new_user()
    TO anon, authenticated, service_role;