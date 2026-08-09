--
-- 1. Bổ sung cột và index cho tìm kiếm full-text
--
ALTER TABLE public.vocabulary_sets
ADD COLUMN fts_tokens TSVECTOR;

-- Tạo GIN index để tăng tốc độ tìm kiếm full-text
CREATE INDEX vocabulary_sets_fts_tokens_idx ON public.vocabulary_sets USING GIN (fts_tokens);

--
-- 2. Function để cập nhật fts_tokens cho một set
--
CREATE
OR REPLACE FUNCTION public.update_vocabulary_set_fts_tokens (p_set_id UUID) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    word_string TEXT;
BEGIN
    -- Lấy tất cả các từ trong set, nối chúng lại thành một chuỗi
    SELECT string_agg(w.word, ' ')
    INTO word_string
    FROM public.set_words sw
    JOIN public.word_senses ws ON sw.word_sense_id = ws.id
    JOIN public.words w ON ws.word_id = w.id
    WHERE sw.set_id = p_set_id;

    -- Cập nhật cột fts_tokens
    UPDATE public.vocabulary_sets
    SET fts_tokens = to_tsvector('english', COALESCE(word_string, ''))
    WHERE id = p_set_id;
END;
$$;

--
-- 3. Trigger để tự động cập nhật fts_tokens khi có thay đổi trong set_words
--
CREATE
OR REPLACE FUNCTION public.handle_set_words_change () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
        -- Cập nhật cho set của bản ghi MỚI
        PERFORM public.update_vocabulary_set_fts_tokens(NEW.set_id);
    END IF;

    IF (TG_OP = 'DELETE' OR TG_OP = 'UPDATE') THEN
        -- Cập nhật cho set của bản ghi CŨ
        PERFORM public.update_vocabulary_set_fts_tokens(OLD.set_id);
    END IF;

    RETURN NULL; -- Kết quả không quan trọng vì là AFTER trigger
END;
$$;

-- Xóa trigger cũ nếu tồn tại để tránh trùng lặp
DROP TRIGGER IF EXISTS on_set_words_change ON public.set_words;

-- Tạo trigger
CREATE TRIGGER on_set_words_change
AFTER INSERT
OR DELETE
OR UPDATE ON public.set_words FOR EACH ROW
EXECUTE FUNCTION public.handle_set_words_change ();

--
-- 4. Function tìm kiếm nâng cao (thay thế hoặc tạo mới)
--
CREATE
OR REPLACE FUNCTION public.advanced_search_sets (
    p_user_id UUID,
    p_name_query TEXT,
    p_contains_word TEXT,
    p_created_after TIMESTAMP WITH TIME ZONE,
    p_created_before TIMESTAMP WITH TIME ZONE,
    p_sort_by TEXT,
    p_sort_order_asc BOOLEAN
) RETURNS TABLE (
    id UUID,
    user_id UUID,
    name TEXT,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE,
    -- Bổ sung các cột khác nếu cần trả về
    word_count BIGINT,
    mastery_level NUMERIC
) LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT
        vs.id,
        vs.user_id,
        vs.name,
        vs.description,
        vs.created_at,
        vs.updated_at,
        (SELECT COUNT(*) FROM public.set_words sw WHERE sw.set_id = vs.id) as word_count,
        -- Giả sử bạn có một logic để tính mastery_level, ví dụ:
        (
            SELECT AVG(up.mastery_level)
            FROM public.user_progress up
            JOIN public.set_words sw ON up.word_sense_id = sw.word_sense_id
            WHERE sw.set_id = vs.id AND up.user_id = p_user_id
        ) as mastery_level
    FROM
        public.vocabulary_sets vs
    WHERE
        vs.user_id = p_user_id
        AND (p_name_query IS NULL OR vs.name ILIKE '%' || p_name_query || '%')
        AND (p_created_after IS NULL OR vs.created_at >= p_created_after)
        AND (p_created_before IS NULL OR vs.created_at <= p_created_before)
        AND (
            p_contains_word IS NULL OR
            -- Sử dụng to_tsquery để tìm kiếm trên cột đã được vector hóa
            vs.fts_tokens @@ to_tsquery('english', p_contains_word)
        )
    ORDER BY
        CASE WHEN p_sort_by = 'name' AND p_sort_order_asc THEN vs.name END ASC,
        CASE WHEN p_sort_by = 'name' AND NOT p_sort_order_asc THEN vs.name END DESC,
        CASE WHEN p_sort_by = 'created_at' AND p_sort_order_asc THEN vs.created_at END ASC,
        CASE WHEN p_sort_by = 'created_at' AND NOT p_sort_order_asc THEN vs.created_at END DESC,
        -- Sắp xếp mặc định
        CASE WHEN p_sort_by IS NULL THEN vs.created_at END DESC;
END;
$$;

--
-- 5. Cập nhật lại toàn bộ fts_tokens cho các set hiện có
--
-- Chạy câu lệnh này một lần sau khi deploy để đảm bảo dữ liệu cũ được index
-- SELECT public.update_vocabulary_set_fts_tokens(id) FROM public.vocabulary_sets;
--
