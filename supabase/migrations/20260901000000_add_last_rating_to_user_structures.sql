-- ============================================================
-- EngFore — Structure SRS encounter modes (Structure = ONE knowledge item)
--
-- Bối cảnh: Learning Session cần phân biệt 5 trạng thái gặp một Structure:
--   NEW / AGAIN               -> sequence <=6 exercises theo thứ tự (rating cuối lượt)
--   HARD                      -> random practice (behavior hiện tại)
--   GOOD / EASY               -> random pure test (KHÔNG render pattern/hint)
--
-- state ('new'|'learning'|'relearning'|'review') đã đủ để xác định NEW/AGAIN;
-- nhưng HARD vs GOOD/EASY (đều nằm ở state='review') cần biết rating TỰ CHẤM
-- GẦN NHẤT của user -> lưu vào cột mới `last_rating` trên chính thẻ SRS đó.
--
-- THAY ĐỔI ADDITIVE-ONLY:
--   * Thêm 1 cột nullable `last_rating smallint` vào public.user_structures.
--   * KHÔNG sửa bất kỳ cột/policy/index/trigger hiện có nào.
--   * Row cũ có last_rating = NULL -> session giữ nguyên behavior hiện tại
--     (random 1 bài, guided reveal sau khi trả lời) cho tới khi user chấm lại.
--   * Giá trị mirror RATING trong src/services/srs.service.js:
--       0 = Again, 2 = Hard, 3 = Good, 4 = Easy (0 không bao giờ xuất hiện ở
--       state='review' vì Again đẩy thẻ về relearning).
-- ============================================================

BEGIN;

ALTER TABLE public.user_structures
  ADD COLUMN IF NOT EXISTS last_rating smallint;

COMMENT ON COLUMN public.user_structures.last_rating IS
  'Most recent self-rating of the owning user (0=Again, 2=Hard, 3=Good, 4=Easy). '
  'NULL = never rated through encounter-mode sessions (legacy row). '
  'Still ONE SRS card per (user_id, structure_id) — no per-exercise cards.';

COMMIT;
