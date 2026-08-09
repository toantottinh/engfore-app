-- =====================================================================
-- FIX (thực tế, đã audit live DB): import_words_to_set bị RLS chặn
-- =====================================================================
--
-- AUDIT TRÊN LIVE DATABASE (project yyfllitihktyrvjssyek):
--   1) pg_proc: import_words_to_set có prosecdef = FALSE  → SECURITY INVOKER
--      owner = postgres, RETURNS text (trả về string, KHÔNG có bảng).
--   2) pg_policies bảng `words`:
--        - SELECT:  USING (auth.role() = 'authenticated')
--        - INSERT:  WITH CHECK (auth.role() = 'authenticated')
--      → KHÔNG có policy UPDATE/DELETE nào cho `words`.
--   3) Cột: words(id, word, ipa, cefr_level) — KHÔNG có user_id/owner_id.
--      word_senses.word_type = USER-DEFINED (enum public.word_type, NOT NULL).
--      words.cefr_level = USER-DEFINED (enum public.cefr_level, nullable).
--
-- NGUYÊN NHÂN LỖI "new row violates row-level security policy (USING expression)
-- for table \"words\"" :
--   Hàm cũ chạy SECURITY INVOKER dưới quyền `authenticated`. Với
--   `INSERT ... ON CONFLICT (word) DO UPDATE SET ipa=..., cefr_level=...`,
--   PostgreSQL cần QUYỀN UPDATE trên `words` VÀ một policy UPDATE khớp.
--   Bảng `words` KHÔNG có policy UPDATE → RLS chặn nhánh DO UPDATE, báo
--   "USING expression". (Lỗi xảy ra khi từ đã tồn tại trong bảng `words`
--   chung của từ điển — đúng với từ vựng phổ biến như "apple", "book"...)
--
-- GIẢI PHÁP (an toàn, không disable RLS, không dùng service_role):
--   - Chuyển hàm thành SECURITY DEFINER (owner = postgres → bypass RLS khi
--     thao tác bảng). Đây là cách chuẩn cho function ghi vào bảng dùng chung.
--   - VẪN bắt buộc xác thực ownership bên trong:
--       * auth.uid() != null (phải đăng nhập)
--       * vocabulary_sets.id = p_set_id VÀ user_id = auth.uid() (chỉ vào set của mình)
--   - Bỏ `ON CONFLICT ... DO UPDATE` (vốn là thủ phạm) → chỉ `INSERT` + nếu
--     trùng word thì tái sử dụng word hiện có (select). Không cập nhật dữ liệu
--     từ điển chung bởi người khác.
--   - Trả về TABLE(imported int, errored int) để frontend đếm được.
--   - GRANT EXECUTE cho authenticated + service_role.
--
-- LƯU Ý: Hàm cũ RETURNS text. Vì không thể đổi kiểu trả về bằng
-- CREATE OR REPLACE, phải DROP FUNCTION trước rồi tạo mới.
-- =====================================================================

DROP FUNCTION IF EXISTS public.import_words_to_set(uuid, jsonb);

CREATE OR REPLACE FUNCTION public.import_words_to_set(
    p_set_id uuid,
    p_words_data jsonb
)
RETURNS TABLE(imported int, errored int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id   uuid;
    v_word_id   uuid;
    v_sense_id  uuid;
    v_item      jsonb;
    v_word      text;
    v_ipa       text;
    v_cefr      text;
    v_type      text;
    v_meaning   text;
    v_example   text;
    v_descr     text;
    v_imported  int := 0;
    v_errored   int := 0;
BEGIN
    -- 1) Phải đăng nhập
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Bạn cần đăng nhập để nhập từ.';
    END IF;

    -- 2) Chỉ được nhập vào set thuộc về chính mình
    IF NOT EXISTS (
        SELECT 1 FROM public.vocabulary_sets
        WHERE id = p_set_id AND user_id = v_user_id
    ) THEN
        RAISE EXCEPTION 'Bạn không có quyền nhập từ vào bộ từ này.';
    END IF;

    -- 3) Duyệt từng từ
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_words_data)
    LOOP
        v_word := trim(coalesce(v_item->>'word', ''));
        IF v_word = '' THEN
            v_errored := v_errored + 1;
            CONTINUE;
        END IF;

        v_ipa     := nullif(trim(coalesce(v_item->>'ipa', '')), '');
        v_cefr    := nullif(upper(trim(coalesce(v_item->>'cefr', ''))), '');
        v_type    := lower(coalesce(nullif(trim(coalesce(v_item->>'word_type', '')), ''), 'other'));
        v_meaning := trim(coalesce(v_item->>'meaning', ''));
        v_example := nullif(trim(coalesce(v_item->>'example', '')), '');
        v_descr   := nullif(trim(coalesce(v_item->>'description', '')), '');

        -- 3a) Tái sử dụng word nếu đã tồn tại trong từ điển chung
        SELECT id INTO v_word_id FROM public.words WHERE word = v_word;
        IF v_word_id IS NULL THEN
            IF v_cefr IS NOT NULL THEN
                INSERT INTO public.words (word, ipa, cefr_level)
                VALUES (v_word, v_ipa, v_cefr::public.cefr_level)
                ON CONFLICT (word) DO NOTHING
                RETURNING id INTO v_word_id;
            ELSE
                INSERT INTO public.words (word, ipa)
                VALUES (v_word, v_ipa)
                ON CONFLICT (word) DO NOTHING
                RETURNING id INTO v_word_id;
            END IF;
            IF v_word_id IS NULL THEN
                SELECT id INTO v_word_id FROM public.words WHERE word = v_word;
            END IF;
        END IF;

        -- 3b) Tạo một nghĩa mới
        INSERT INTO public.word_senses (word_id, word_type, meaning, description, example)
        VALUES (v_word_id, v_type::public.word_type, v_meaning, v_descr, v_example)
        RETURNING id INTO v_sense_id;

        -- 3c) Liên kết vào set (ownership đã kiểm tra ở bước 2)
        INSERT INTO public.set_words (set_id, word_sense_id)
        VALUES (p_set_id, v_sense_id)
        ON CONFLICT (set_id, word_sense_id) DO NOTHING;

        v_imported := v_imported + 1;
    END LOOP;

    RETURN QUERY SELECT v_imported, v_errored;
END;
$$;

GRANT EXECUTE ON FUNCTION public.import_words_to_set(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.import_words_to_set(uuid, jsonb) TO service_role;
