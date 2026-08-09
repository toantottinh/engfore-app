# PHASE SRS HARDENING — TODO

## Mục tiêu
Thống nhất Flashcard / Typing / Review về MỘT logic SRS, MỘT mastery, MỘT interval, lưu bền vững trên Supabase.

## Bước thực hiện

- [x] **1. Audit database production** (PostgREST, anon key):
  - [x] Xác nhận `user_progress` tồn tại
  - [x] Xác nhận các cột: `user_id`, `word_sense_id`, `mastery_level`, `review_due_at`, `last_reviewed_at`
  - [x] Xác nhận KHÔNG có `next_review_at` → production dùng `review_due_at`
  - [x] Ghi nhận hạn chế: không audit được RLS policies & `get_mastery_stats` content qua anon key

- [x] **2. Sửa `database/schema.sql`** để khớp production (`review_due_at`, `last_reviewed_at`, bỏ `next_review_at`)

- [x] **3. `src/services/learning.service.js`**:
  - [x] Tạo `recordLearningResult({ userId, wordSenseId, correct })` — SINGLE SOURCE OF TRUTH
  - [x] Mastery: correct → +1, incorrect → −1, clamp 0–5
  - [x] Interval duy nhất theo giờ `[4, 8, 24, 72, 168, 336]`
  - [x] Cập nhật `last_reviewed_at`
  - [x] Giữ `getDueReviewWords` / `getDueReviewWordsCount`
  - [x] Bỏ `updateWordProgress` (migrate) và `saveReviewResult`

- [x] **4. `src/hooks/useLearning.js`** — `recordProgress` → `{ correct }`, gọi `recordLearningResult`

- [x] **5. `src/pages/FlashcardPractice/index.jsx`** — recall → correct (Nhớ/Rất dễ→correct; Chưa nhớ/Khó→incorrect)

- [x] **6. `src/pages/TypingPractice/index.jsx`** — xác nhận đã dùng `{ correct: isCorrect }`

- [x] **7. `src/pages/Review/index.jsx`** — dùng `recordLearningResult` per word, bỏ `saveReviewResult`, empty state "🎉 Bạn đã hoàn thành tất cả bài ôn hôm nay!"

- [x] **8. Xác nhận không còn reference `saveReviewResult` / `updateWordProgress`**

- [x] **9. Legacy:** xác nhận React không dùng `review.js`, `db.service.js`, `main.js`, `router.js` (không xóa)

- [x] **10. Ghi chú `get_mastery_stats`** (không tạo RPC mới, React không gọi)

- [x] **11. Build** — `npm run build` PASS (vite build, 111 modules, built in 3.35s)

- [ ] **12. Test flow A–G** — cần thực hiện thủ công trên browser (import từ, flashcard "Nhớ", typing sai, review, refresh, logout/login). Không thể tự động hoá trong môi trường này.

## KẾT QUẢ AUDIT PRODUCTION (xác nhận thực tế qua PostgREST)
```
✓ user_id
✓ word_sense_id
✓ mastery_level
✓ review_due_at
✓ last_reviewed_at
✗ (KHÔNG TỒN TẠI) sense_id, word_id, mastery, next_review_at,
  created_at, updated_at, easiness, repetitions, interval
```
→ Production DÙNG `review_due_at`, KHÔNG dùng `next_review_at`.
