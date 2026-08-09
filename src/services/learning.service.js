import { supabase } from './supabase.js';

/**
 * Dịch vụ theo dõi tiến trình học tập.
 * Ghi vào bảng user_progress (schema hiện tại).
 * mastery_level: 0 = chưa học, 1-4 = đang học, 5 = đã thuộc.
 */

/**
 * Cập nhật tiến trình học của một từ.
 * @param {string} wordSenseId
 * @param {string} userId
 * @param {{ correct?: boolean, recall?: number }} info
 *   - correct: đúng/sai trong typing -> tăng/giảm điểm
 *   - recall: mức ghi nhớ trong flashcard (0-3)
 */
export async function updateWordProgress(wordSenseId, userId, { correct, recall } = {}) {
  // Lấy bản ghi hiện tại
  const { data: existing, error: fetchError } = await supabase
    .from('user_progress')
    .select('*')
    .eq('word_sense_id', wordSenseId)
    .eq('user_id', userId)
    .maybeSingle();

  if (fetchError && fetchError.code !== 'PGRST116') {
    return { error: fetchError };
  }

  const now = new Date().toISOString();
  let mastery = existing?.mastery_level ?? 0;

  if (typeof recall === 'number') {
    // Flashcard recall: 0 = chưa nhớ, 1 = khó, 2 = nhớ, 3 = rất dễ
    if (recall <= 0) mastery = Math.max(0, mastery - 1);
    else if (recall === 1) mastery = Math.max(1, mastery);
    else if (recall === 2) mastery = Math.min(5, mastery + 1);
    else mastery = Math.min(5, mastery + 2);
  } else if (typeof correct === 'boolean') {
    mastery = correct ? Math.min(5, mastery + 1) : Math.max(0, mastery - 1);
  }

  const payload = {
    user_id: userId,
    word_sense_id: wordSenseId,
    mastery_level: mastery,
    last_reviewed_at: now,
    review_due_at: calculateNextReview(mastery),
  };

  const { error } = await supabase.from('user_progress').upsert(payload);
  return { error };
}

/** Tính thời điểm ôn tập tiếp theo dựa trên mức độ thành thạo. */
function calculateNextReview(mastery) {
  const now = Date.now();
  const intervals = [0, 1, 3, 7, 14, 30]; // ngày
  const days = intervals[Math.min(mastery, intervals.length - 1)] ?? 0;
  return new Date(now + days * 24 * 60 * 60 * 1000).toISOString();
}
