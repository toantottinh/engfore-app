-- Lấy user_id hiện tại từ session JWT
CREATE OR REPLACE FUNCTION auth.current_user_id()
RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid;
$$;

-- KÍCH HOẠT ROW LEVEL SECURITY (RLS) TRÊN TẤT CẢ CÁC BẢNG
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vocabulary_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.set_words ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_progress ENABLE ROW LEVEL SECURITY;
-- Bảng `words` và `word_senses` là dữ liệu chung, không cần RLS quá khắt khe
ALTER TABLE public.words ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.word_senses ENABLE ROW LEVEL SECURITY;


-- TẠO CÁC CHÍNH SÁCH (POLICIES)

-- Bảng `users`: User có thể xem profile của người khác, nhưng chỉ có thể cập nhật của chính mình.
CREATE POLICY "Users can view all profiles."
  ON public.users FOR SELECT
  USING (true);
CREATE POLICY "Users can insert or update their own profile."
  ON public.users FOR ALL
  USING (auth.current_user_id() = id);

-- Bảng `vocabulary_sets`: User chỉ có thể thao tác trên các bộ từ vựng của chính họ.
CREATE POLICY "Users can only manage their own vocabulary sets."
  ON public.vocabulary_sets FOR ALL
  USING (auth.current_user_id() = user_id);

-- Bảng `user_progress`: User chỉ có thể thao tác trên tiến trình học của chính họ.
CREATE POLICY "Users can only manage their own learning progress."
  ON public.user_progress FOR ALL
  USING (auth.current_user_id() = user_id);

-- Bảng `set_words`: User chỉ có thể thao tác trên các liên kết thuộc về bộ từ vựng của họ.
CREATE POLICY "Users can only manage words within their own sets."
  ON public.set_words FOR ALL
  USING (
    (SELECT user_id FROM public.vocabulary_sets WHERE id = set_id) = auth.current_user_id()
  );

-- Bảng `words` và `word_senses`: Bất kỳ user nào đã đăng nhập đều có thể xem.
-- Chỉ cho phép thêm từ mới, không cho phép sửa/xóa để bảo toàn dữ liệu chung.
CREATE POLICY "Authenticated users can view all words and senses."
  ON public.words FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can view all words and senses."
  ON public.word_senses FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert words and senses."
  ON public.words FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can insert words and senses."
  ON public.word_senses FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');
-- Index cho các khóa ngoại để tăng tốc độ JOIN
CREATE INDEX ON public.vocabulary_sets (user_id);
CREATE INDEX ON public.word_senses (word_id);
CREATE INDEX ON public.set_words (set_id);
CREATE INDEX ON public.set_words (word_sense_id);
CREATE INDEX ON public.user_progress (user_id);
CREATE INDEX ON public.user_progress (word_sense_id);

-- Index cho các cột thường được dùng để tìm kiếm, lọc hoặc sắp xếp
CREATE INDEX ON public.words (word); -- Rất quan trọng cho việc tìm kiếm từ
CREATE INDEX ON public.vocabulary_sets (user_id, name); -- Tìm kiếm set theo tên
CREATE INDEX ON public.user_progress (user_id, review_due_at); -- Cực kỳ quan trọng để lấy danh sách từ cần ôn tập
-- 1. TẠO CÁC KIỂU DỮ LIỆU TÙY CHỈNH (ENUMS)
-- Điều này đảm bảo dữ liệu nhất quán hơn là dùng TEXT
CREATE TYPE public.cefr_level AS ENUM ('A1', 'A2', 'B1', 'B2', 'C1', 'C2');
CREATE TYPE public.word_type AS ENUM ('noun', 'verb', 'adjective', 'adverb', 'preposition', 'conjunction', 'pronoun', 'other');

-- 2. BẢNG USERS
-- Lưu trữ thông tin public của người dùng, liên kết 1-1 với bảng auth.users của Supabase
CREATE TABLE public.users (
    id uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT UNIQUE,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.users IS 'Public profile information for each user.';

-- 3. BẢNG VOCABULARY_SETS
-- Đại diện cho một bộ từ vựng do người dùng tạo
CREATE TABLE public.vocabulary_sets (
    id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.vocabulary_sets IS 'Represents a collection of words created by a user.';

-- 4. BẢNG WORDS
-- Bảng trung tâm chứa các từ duy nhất để tránh trùng lặp
CREATE TABLE public.words (
    id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    word TEXT NOT NULL UNIQUE,
    ipa TEXT,
    cefr_level public.cefr_level
);
COMMENT ON TABLE public.words IS 'Central repository for unique English words.';

-- 5. BẢNG WORD_SENSES
-- Lưu các nghĩa khác nhau của một từ (ví dụ "book" (danh từ) và "book" (động từ))
CREATE TABLE public.word_senses (
    id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    word_id uuid NOT NULL REFERENCES public.words(id) ON DELETE CASCADE,
    word_type public.word_type NOT NULL,
    meaning TEXT NOT NULL, -- Nghĩa tiếng Việt
    description TEXT, -- Mô tả bằng tiếng Anh
    example TEXT
);
COMMENT ON TABLE public.word_senses IS 'Stores different meanings and contexts for a single word.';

-- 6. BẢNG SET_WORDS (Bảng trung gian)
-- Liên kết các nghĩa của từ (word_senses) vào các bộ từ vựng (vocabulary_sets)
CREATE TABLE public.set_words (
    set_id uuid NOT NULL REFERENCES public.vocabulary_sets(id) ON DELETE CASCADE,
    word_sense_id uuid NOT NULL REFERENCES public.word_senses(id) ON DELETE CASCADE,
    PRIMARY KEY (set_id, word_sense_id)
);
COMMENT ON TABLE public.set_words IS 'Junction table linking word senses to vocabulary sets.';

-- 7. BẢNG USER_PROGRESS
-- Theo dõi tiến trình học tập và lịch trình ôn tập của người dùng cho mỗi từ
CREATE TABLE public.user_progress (
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    word_sense_id uuid NOT NULL REFERENCES public.word_senses(id) ON DELETE CASCADE,
    mastery_level INT NOT NULL DEFAULT 0 CHECK (mastery_level >= 0 AND mastery_level <= 5),
    review_due_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_reviewed_at TIMESTAMPTZ,
    PRIMARY KEY (user_id, word_sense_id)
);
COMMENT ON TABLE public.user_progress IS 'Tracks a user''s learning progress for each word sense.';

-- 8. TRIGGER TỰ ĐỘNG TẠO USER PROFILE
-- Function này sẽ được gọi mỗi khi có user mới đăng ký
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, username)
  VALUES (new.id, new.raw_user_meta_data->>'username');
  RETURN new;
END;
$$;

-- Gắn trigger vào bảng auth.users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
