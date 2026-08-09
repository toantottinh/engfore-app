import { supabase } from './supabase.js';

/**
 * Dịch vụ theo dõi tiến trình học tập (SRS / Spaced Repetition).
 *
 * SINGLE SOURCE OF TRUTH:
 *   - `recordLearningResult` là hàm DUY NHẤT ghi lại kết quả trả lời
 *     (Flashcard, Typing, Review đều gọi hàm này).
 *   - Tất cả logic tính mastery và lịch ôn tập (review_due_at) tập trung ở đây.
 *
 * Schema production (đã audit):
 *   user_progress(user_id, word_sense_id, mastery_level, review_due_at, last_reviewed_at)
 *
 * Luật mastery:
 *   - correct   -> mastery + 1
 *   - incorrect -> mastery - 1
 *   - clamp trong khoảng [0, 5]
 *
 * Interval ôn tập (theo giờ) — MỘT bộ duy nhất cho toàn hệ thống:
 *   [4, 8, 24, 72, 168, 336]  =>  4h → 8h → 1d → 3d → 7d → 14d
 */

/** Hằng số interval SRS (giờ), index theo mastery_level (0–5). */
export const SRS_INTERVALS_HOURS = [4, 8, 24, 72, 168, 336];

/** Giới hạn mastery. */
export const MASTERY_MIN = 0;
export const MASTERY_MAX = 5;

/** Giới hạn queue review mặc định. */
export const REVIEW_QUEUE_LIMIT = 50;

/**
 * Tính thời điểm ôn tập tiếp theo dựa trên mastery_level mới.
 * Dùng chung MỘT bộ interval [4, 8, 24, 72, 168, 336] giờ (index theo mastery).
 * @param {number} mastery mastery_level sau khi đã cập nhật (0–5)
 * @returns {string} ISO timestamp của review_due_at
 */
export function calculateNextReview(mastery) {
  const clamped = Math.min(Math.max(mastery, MASTERY_MIN), MASTERY_MAX);
  const hours = SRS_INTERVALS_HOURS[clamped] ?? SRS_INTERVALS_HOURS[MASTERY_MAX];
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

/**
 * [DUY NHẤT] Ghi lại một kết quả học tập và cập nhật user_progress.
 *
 * Flow:
 *   1. Lấy progress hiện tại của (user_id, word_sense_id).
 *   2. Tính mastery mới: correct -> +1, incorrect -> -1 (clamp 0–5).
 *   3. Tính review_due_at mới theo mastery mới.
 *   4. Cập nhật last_reviewed_at.
 *   5. Upsert user_progress.
 *   6. Trả về progress mới.
 *
 * @param {{ userId: string, wordSenseId: string, correct: boolean }} params
 * @returns {Promise<{ progress: object | null, error: object | null }>}
 */
export async function recordLearningResult({ userId, wordSenseId, correct }) {
  if (!userId || !wordSenseId || typeof correct !== 'boolean') {
    return { progress: null, error: { message: 'Thiếu userId, wordSenseId hoặc correct.' } };
  }

  // 1. Lấy progress hiện tại
  const { data: existing, error: fetchError } = await supabase
    .from('user_progress')
    .select('*')
    .eq('user_id', userId)
    .eq('word_sense_id', wordSenseId)
    .maybeSingle();

  if (fetchError && fetchError.code !== 'PGRST116') {
    return { progress: null, error: fetchError };
  }

  // 2. Tính mastery mới
  const currentMastery = existing?.mastery_level ?? 0;
  const nextMastery = correct
    ? Math.min(currentMastery + 1, MASTERY_MAX)
    : Math.max(currentMastery - 1, MASTERY_MIN);

  // 3–4. Tính review_due_at + last_reviewed_at
  const nowIso = new Date().toISOString();
  const payload = {
    user_id: userId,
    word_sense_id: wordSenseId,
    mastery_level: nextMastery,
    review_due_at: calculateNextReview(nextMastery),
    last_reviewed_at: nowIso,
  };

  // 5. Upsert
  const { error } = await supabase.from('user_progress').upsert(payload);
  if (error) return { progress: null, error };

  return {
    progress: { ...payload },
    error: null,
  };
}

/**
 * Lấy danh sách từ đến hạn ôn tập của user (review_due_at <= now).
 * Chỉ lấy từ thuộc user hiện tại, giới hạn mặc định 50 từ, ưu tiên quá hạn lâu nhất.
 * @param {string} userId
 * @param {number} limit
 */
export async function getDueReviewWords(userId, limit = REVIEW_QUEUE_LIMIT) {
  const { data, error } = await supabase
    .from('user_progress')
    .select(
      `word_sense_id,
       mastery_level,
       review_due_at,
       last_reviewed_at,
       word_senses (
         id,
         word_type,
         meaning,
         description,
         example,
         words (
           word,
           ipa,
           cefr_level
         )
       )`
    )
    .eq('user_id', userId)
    .lte('review_due_at', new Date().toISOString())
    .order('review_due_at', { ascending: true })
    .limit(limit);

  if (error) return { data: null, error };

  const merged = (data || []).map((item) => {
    const sense = item.word_senses || {};
    const word = sense.words || {};
    return {
      id: sense.id || item.word_sense_id,
      word: word.word || '',
      ipa: word.ipa || '',
      cefr_level: word.cefr_level || '',
      word_type: sense.word_type || '',
      meaning: sense.meaning || '',
      description: sense.description || '',
      example: sense.example || '',
      mastery_level: item.mastery_level ?? 0,
      review_due_at: item.review_due_at,
      last_reviewed_at: item.last_reviewed_at,
    };
  });

  return { data: merged, error: null };
}

/**
 * Đếm TỔNG số từ đến hạn ôn tập của user (cho badge hiển thị).
 * Không giới hạn 50 — trả toàn bộ số từ đến hạn.
 * @param {string} userId
 */
export async function getDueReviewWordsCount(userId) {
  const { count, error } = await supabase
    .from('user_progress')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .lte('review_due_at', new Date().toISOString());
  return { count: count ?? 0, error };
}
