-- =====================================================================
-- ADD NEW word_type ENUM VALUES (safe, non-destructive)
-- =====================================================================
--
-- Audit (live DB): enum public.word_type hiện chỉ có 8 giá trị:
--   noun, verb, adjective, adverb, preposition, conjunction, pronoun, other
--
-- Mục đích: thêm 4 loại từ mới để Vocabulary Importer KHÔNG phải map
-- "phrasal verb" → "verb" / "verb phrase" → "verb" (tránh mất thông tin).
--
-- AN TOÀN:
--   - CHỈ THÊM giá trị mới, KHÔNG xóa/sửa giá trị cũ.
--   - Không đụng dữ liệu cũ.
--   - Không disable RLS.
--   - Không đổi authentication.
--
-- LƯU Ý PostgreSQL: `ALTER TYPE ... ADD VALUE` không thể chạy trong cùng
-- transaction/block với câu lệnh khác trong một số phiên bản. File này
-- tách riêng từng ADD VALUE ở top-level để an toàn trên Supabase.
-- =====================================================================

ALTER TYPE public.word_type ADD VALUE IF NOT EXISTS 'determiner';

ALTER TYPE public.word_type ADD VALUE IF NOT EXISTS 'interjection';

ALTER TYPE public.word_type ADD VALUE IF NOT EXISTS 'phrasal_verb';
