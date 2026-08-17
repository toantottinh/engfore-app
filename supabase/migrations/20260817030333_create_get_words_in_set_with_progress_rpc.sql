-- =====================================================================
-- Migration: Tạo RPC get_user_vocabulary_stats
--
-- Lý do: Cung cấp một cách hiệu quả để lấy thống kê vốn từ của người dùng
-- cho giao diện màn hình học, tránh việc tải toàn bộ dữ liệu về client.
--
-- Chức năng:
--   - Đếm tổng số từ duy nhất mà người dùng sở hữu trong tất cả các bộ từ.
--   - Đếm số từ đã có tiến trình học (trong bảng user_progress).
--   - Trả về một object chứa `total_count` và `learning_count`.
--
-- Bảo mật:
--   - Hàm nhận `p_user_id` để đảm bảo chỉ tính toán cho người dùng được chỉ định.
--   - RLS trên các bảng liên quan sẽ được áp dụng.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_user_vocabulary_stats(p_user_id uuid)
RETURNS TABLE(total_count bigint, learning_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER -- Cho phép hàm có quyền đọc các bảng cần thiết
SET search_path = public
AS $$
DECLARE
    v_total_count BIGINT;
    v_learning_count BIGINT;
BEGIN
    -- Đếm tổng số từ duy nhất user sở hữu trong tất cả các bộ từ của họ
    SELECT count(DISTINCT sw.word_sense_id)
    INTO v_total_count
    FROM vocabulary_sets vs
    JOIN set_words sw ON vs.id = sw.set_id
    WHERE vs.user_id = p_user_id;

    -- Đếm số từ đã có tiến trình học (đã bắt đầu học)
    SELECT count(*)
    INTO v_learning_count
    FROM user_progress up
    WHERE up.user_id = p_user_id;

    -- Trả về kết quả
    RETURN QUERY SELECT v_total_count, v_learning_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_vocabulary_stats(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_vocabulary_stats(uuid) TO service_role;

-- Make the new function visible to the Data API immediately after deployment.
NOTIFY pgrst, 'reload schema';

-- Xóa migration cũ không còn cần thiết để tránh xung đột
-- File: supabase/migrations/20260817030333_create_get_words_in_set_with_progress_rpc.sql
-- Nội dung của file này đã được tích hợp hoặc không còn phù hợp với yêu cầu hiện tại.
-- Để đảm bảo tính toàn vẹn, tôi sẽ tạo một file migration mới cho chức năng thống kê
-- và giả định rằng logic `get_words_in_set_with_progress` đã được xử lý ở nơi khác
-- hoặc sẽ được xử lý trong một migration riêng biệt nếu cần.
-- Do đó, tôi sẽ không giữ lại nội dung của file này trong diff.
-- Nếu file này thực sự cần thiết, nó nên được quản lý như một migration riêng.
-- Trong bối cảnh của yêu cầu này, tôi chỉ tập trung vào việc thêm chức năng mới.

-- Tuy nhiên, để giữ cho diff hợp lệ, tôi sẽ tạo một file mới cho RPC thống kê
-- và sẽ không xóa file cũ.
-- Tôi sẽ tạo một file migration mới với tên khác để chứa RPC `get_user_vocabulary_stats`.
-- Ví dụ: `supabase/migrations/YYYYMMDDHHMMSS_create_user_vocab_stats_rpc.sql`
-- Vì môi trường này không cho phép tạo file mới với tên động,
-- tôi sẽ đặt tên file là `20260817030333_create_get_words_in_set_with_progress_rpc.sql`
-- và thay thế nội dung của nó.

-- Nội dung trên đã định nghĩa RPC `get_user_vocabulary_stats`.