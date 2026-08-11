import { supabase } from './supabase.js';
import { computeSrsUpdate, RATING } from './srs.service.js';

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
export async function recordLearningResult({ userId, wordSenseId, correct, rating }) {
  // Accept either legacy { correct: boolean } or new { rating }
  if (!userId || !wordSenseId || (typeof correct === 'undefined' && typeof rating === 'undefined')) {
    return { progress: null, error: { message: 'Thiếu userId, wordSenseId hoặc result.' } };
  }

  // Map legacy boolean to rating if needed
  let r = rating;
  if (typeof r === 'undefined') {
    r = correct ? RATING.GOOD : RATING.AGAIN;
  }

  // First, compute SRS update payload using srs.service (if DB has columns)
  try {
    const { progress: srsProgress, error: srsErr } = await computeSrsUpdate({ userId, wordSenseId, rating: r });
    if (srsErr) throw srsErr;

    // Also preserve/update mastery_level using legacy rule (correct -> +1, incorrect -> -1)
    // Fetch existing mastery to apply change
    const { data: existing, error: fetchError } = await supabase
      .from('user_progress')
      .select('mastery_level, review_count')
      .eq('user_id', userId)
      .eq('word_sense_id', wordSenseId)
      .maybeSingle();
    if (fetchError && fetchError.code !== 'PGRST116') {
      return { progress: null, error: fetchError };
    }
    const currentMastery = existing?.mastery_level ?? 0;
    const currentReviewCount = existing?.review_count ?? 0;
    // Determine mastery change: rating >= HARD (2) => correct (HARD counts as remembered)
    const isCorrect = Number(r) >= RATING.HARD;
    const nextMastery = isCorrect ? Math.min(currentMastery + 1, MASTERY_MAX) : Math.max(currentMastery - 1, MASTERY_MIN);

    const upsertPayload = {
      ...srsProgress,
      mastery_level: nextMastery,
      review_count: Number(currentReviewCount) + 1,
    };

    // Upsert into user_progress (this requires migration to have the new columns).
    const { error: upsertErr } = await supabase.from('user_progress').upsert(upsertPayload);
    if (upsertErr) {
      // Fallback: if DB doesn't have new columns, revert to original simple behavior
      throw upsertErr;
    }

    return { progress: upsertPayload, error: null };
  } catch (err) {
    // Fallback path: preserve legacy behavior if SRS fields not available or error occurs
    try {
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

      // 2. Tính mastery mới (legacy)
      const currentMastery = existing?.mastery_level ?? 0;
      const currentReviewCount = existing?.review_count ?? 0;
      const isCorrect = Number(r) >= RATING.HARD;
      const nextMastery = isCorrect
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
        review_count: Number(currentReviewCount) + 1,
      };

      // 5. Upsert (legacy)
      const { error } = await supabase.from('user_progress').upsert(payload);
      if (error) return { progress: null, error };

      return { progress: { ...payload }, error: null };
    } catch (fallbackErr) {
      return { progress: null, error: fallbackErr };
    }
  }
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
       review_count,
       review_due_at,
       last_reviewed_at,
       repetitions,
       interval_hours,
       ease_factor,
       lapses,
       state,
       learning_step,
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
      review_count: item.review_count ?? 0,
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

/**
 * Dashboard SRS stats: counts by state + due + next due item (future smallest review_due_at).
 * Returns only minimal columns and uses count-head queries to avoid fetching rows.
 */
export async function getSrsDashboardStats(userId) {
  if (!userId) return { data: null, error: { message: 'Missing userId' } };
  try {
    const nowIso = new Date().toISOString();
    // Count queries (head: true -> returns count without rows)
    const [dueRes, newRes, learningRes, relearnRes, reviewRes, nextRes] = await Promise.all([
      supabase
        .from('user_progress')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .lte('review_due_at', nowIso),
      supabase
        .from('user_progress')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('state', 'new'),
      supabase
        .from('user_progress')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('state', 'learning'),
      supabase
        .from('user_progress')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('state', 'relearning'),
      supabase
        .from('user_progress')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('state', 'review'),
      // next due in future (smallest review_due_at > now)
      supabase
        .from('user_progress')
        .select('review_due_at, state, interval_hours')
        .eq('user_id', userId)
        .gt('review_due_at', nowIso)
        .order('review_due_at', { ascending: true })
        .limit(1),
    ]);

    if (dueRes.error || newRes.error || learningRes.error || relearnRes.error || reviewRes.error || nextRes.error) {
      const firstErr = dueRes.error || newRes.error || learningRes.error || relearnRes.error || reviewRes.error || nextRes.error;
      return { data: null, error: firstErr };
    }

    const nextItem = (nextRes.data && nextRes.data.length > 0) ? nextRes.data[0] : null;

    const stats = {
      due: dueRes.count ?? 0,
      new: newRes.count ?? 0,
      learning: learningRes.count ?? 0,
      relearning: relearnRes.count ?? 0,
      review: reviewRes.count ?? 0,
      nextDueAt: nextItem ? nextItem.review_due_at : null,
      nextState: nextItem ? nextItem.state : null,
      nextIntervalHours: nextItem ? nextItem.interval_hours : null,
    };

    return { data: stats, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}
