import { supabase } from './supabase.js';
import { computeSrsUpdate, RATING } from './srs.service.js';
import { logDailyLearning } from './dailyGoal.service.js';
import {
  DEFAULT_DAILY_NEW_LIMIT,
  DAILY_NEW_LIMIT_OPTIONS,
  DAILY_NEW_LIMIT_KEY,
  resolveDailyNewLimit,
  getDailyDateKey,
  selectNewWordsForToday,
} from './quota.service.js';

// Re-export the pure daily-new-limit helpers so callers import from one place.
export {
  DEFAULT_DAILY_NEW_LIMIT,
  DAILY_NEW_LIMIT_OPTIONS,
  DAILY_NEW_LIMIT_KEY,
  resolveDailyNewLimit,
  getDailyDateKey,
  selectNewWordsForToday,
};

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

/** Số lần flashcard tối thiểu trước khi chuyển sang typing. */
export const FLASHCARD_REVIEWS_THRESHOLD = 2;

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

function isMissingColumn(error, column) {
  const message = String(error?.message || '').toLowerCase();
  return (
    error?.code === '42703' ||
    error?.code === 'PGRST204'
  ) && message.includes(column.toLowerCase());
}

async function saveProgress(payload) {
  const upsert = supabase
    .from('user_progress')
    .upsert(payload, { onConflict: 'user_id,word_sense_id' });
  return typeof upsert?.select === 'function'
    ? upsert.select().maybeSingle()
    : upsert;
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
 * @param {{ userId: string, wordSenseId: string, correct: boolean, rating?: number, isFlashcard?: boolean }} params
 * @returns {Promise<{ progress: object | null, error: object | null }>}
 */
export async function recordLearningResult({ userId, wordSenseId, correct, rating, isFlashcard = false }) {
  // Accept either legacy { correct: boolean } or new { rating }
  if (!userId || !wordSenseId || (typeof correct === 'undefined' && typeof rating === 'undefined')) {
    return { progress: null, error: { message: 'Thiếu userId, wordSenseId hoặc result.' } };
  }

  // Map legacy boolean to rating if needed
  let r = rating;
  if (typeof r === 'undefined') {
    r = correct ? RATING.GOOD : RATING.AGAIN;
  }

  // `computeSrsUpdate` is also used by the interval preview. Do not fall back
  // to the legacy scheduler here: preview and persisted `review_due_at` must
  // always be calculated by the same SRS implementation.
  try {
    const { progress: srsProgress, error: srsErr } = await computeSrsUpdate({ userId, wordSenseId, rating: r });
    if (srsErr) throw srsErr;

    // Also preserve/update mastery_level using legacy rule (correct -> +1, incorrect -> -1)
    // Fetch existing mastery to apply change
    const { data: existing, error: fetchError } = await supabase
      .from('user_progress')
      .select('mastery_level, review_count, flashcard_reviews')
      .eq('user_id', userId)
      .eq('word_sense_id', wordSenseId)
      .maybeSingle();
    // Production can temporarily be one migration behind. Fetching the
    // optional flashcard column would then fail before the real save attempt,
    // so retry this read with guaranteed columns only. The write below still
    // reports every error except this one known migration gap.
    let safeExisting = existing;
    if (fetchError && isMissingColumn(fetchError, 'flashcard_reviews')) {
      const fallbackRead = await supabase
        .from('user_progress')
        .select('mastery_level, review_count')
        .eq('user_id', userId)
        .eq('word_sense_id', wordSenseId)
        .maybeSingle();
      if (fallbackRead.error && fallbackRead.error.code !== 'PGRST116') {
        return { progress: null, error: fallbackRead.error };
      }
      safeExisting = fallbackRead.data;
    } else if (fetchError && fetchError.code !== 'PGRST116') {
      return { progress: null, error: fetchError };
    }
    const currentMastery = safeExisting?.mastery_level ?? 0;
    const currentReviewCount = safeExisting?.review_count ?? 0;
    const currentFlashcardReviews = Number(safeExisting?.flashcard_reviews ?? 0);
    // Determine mastery change: rating >= HARD (2) => correct (HARD counts as remembered)
    const isCorrect = Number(r) >= RATING.HARD;
    const nextMastery = isCorrect ? Math.min(currentMastery + 1, MASTERY_MAX) : Math.max(currentMastery - 1, MASTERY_MIN);

    const upsertPayload = {
      ...srsProgress,
      mastery_level: nextMastery,
      review_count: Number(currentReviewCount) + 1,
      // Tăng flashcard_reviews khi đây là lượt flashcard (server lưu thành công mới tăng).
      flashcard_reviews: isFlashcard
        ? Math.min(currentFlashcardReviews + 1, FLASHCARD_REVIEWS_THRESHOLD)
        : currentFlashcardReviews,
    };

    let saveResult = await saveProgress(upsertPayload);
    let flashcardReviewsPersisted = true;
    if (isMissingColumn(saveResult.error, 'flashcard_reviews')) {
      // This is a real, diagnosed schema mismatch (42703/PGRST204), not a
      // swallowed DB error. Save the SRS fields that do exist so a user is not
      // blocked while the included migration is deployed.
      const { flashcard_reviews: _flashcardReviews, ...compatiblePayload } = upsertPayload;
      saveResult = await saveProgress(compatiblePayload);
      flashcardReviewsPersisted = false;
    }
    if (saveResult.error) return { progress: null, error: saveResult.error };

    // Daily goal (daily_learning_log): count a brand-new word exactly ONCE —
    // on its first-ever rating (no prior user_progress row). Cards that already
    // have progress (learning/review/relearning) never increment, so reviewing
    // yesterday's words cannot inflate today's goal. The increment is
    // non-fatal: if the RPC fails (e.g. RLS/network), the SRS save is kept.
    if (safeExisting == null && userId) {
      logDailyLearning(1).catch(() => {});
    }

    return {
      progress: {
        ...(saveResult.data || upsertPayload),
        flashcard_reviews_persisted: flashcardReviewsPersisted,
      },
      error: null,
    };
  } catch (err) {
    return { progress: null, error: err };
  }
}

/**
 * Lấy danh sách từ đến hạn ôn tập của user (review_due_at <= now).
 * Chỉ lấy từ thuộc user hiện tại, giới hạn mặc định 50 từ, ưu tiên quá hạn lâu nhất.
 * @param {string} userId
 * @param {number} limit
 */
// Base columns guaranteed to exist in the production database.
const BASE_PROGRESS_SELECT = `word_sense_id,
        mastery_level,
        review_count,
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
        )`;

// Extended SRS columns from migrations (may not exist in every DB environment).
const SRS_PROGRESS_SELECT = `word_sense_id,
        mastery_level,
        review_count,
        flashcard_reviews,
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
        )`;

/**
 * Map a raw user_progress row into the unified word shape.
 * Falls back to safe defaults for any SRS columns that may be missing.
 */
function mapProgressRow(item) {
  const sense = item.word_senses || {};
  const word = sense.words || {};
  return {
    id: sense.id || item.word_sense_id,
    word: word.word || '',
    ipa: word.ipa || '',
    cefr_level: word.cefr_level || '',
    word_type: sense.word_type || '',
    meaning: sense.meaning || '',
    memory_clue: sense.description || '',
    example: sense.example || '',
    mastery_level: item.mastery_level ?? 0,
    review_count: item.review_count ?? 0,
    flashcard_reviews: item.flashcard_reviews ?? 0,
    review_due_at: item.review_due_at,
    last_reviewed_at: item.last_reviewed_at,
    repetitions: item.repetitions ?? 0,
    interval_hours: item.interval_hours ?? 0,
    ease_factor: item.ease_factor ?? 2.5,
    lapses: item.lapses ?? 0,
    state: item.state ?? 'new',
    learning_step: item.learning_step ?? 0,
  };
}

/**
 * Fetch user_progress rows with graceful fallback: try the full SRS column
 * set first, and if a column does not exist, retry with only base columns
 * and fill the rest with defaults.
 */
async function fetchProgressRows(selectText, userId, limit) {
  let { data, error } = await supabase
    .from('user_progress')
    .select(selectText)
    .eq('user_id', userId)
    .lte('review_due_at', new Date().toISOString())
    .order('review_due_at', { ascending: true })
    .limit(limit);

  if (error) {
    ({ data, error } = await supabase
      .from('user_progress')
      .select(BASE_PROGRESS_SELECT)
      .eq('user_id', userId)
      .lte('review_due_at', new Date().toISOString())
      .order('review_due_at', { ascending: true })
      .limit(limit));
    if (error) return { data: null, error };
  }

  return { data: data || [], error: null };
}

/**
 * Lấy danh sách từ đến hạn ôn tập của user (review_due_at <= now).
 * Chỉ lấy từ thuộc user hiện tại, giới hạn mặc định 50 từ, ưu tiên quá hạn lâu nhất.
 * @param {string} userId
 * @param {number} limit
 */
export async function getDueReviewWords(userId, limit = REVIEW_QUEUE_LIMIT) {
  const { data, error } = await fetchProgressRows(SRS_PROGRESS_SELECT, userId, limit);
  if (error) return { data: null, error };

  const merged = data.map(mapProgressRow);
  return { data: merged, error: null };
}

/**
 * Lấy danh sách từ đến hạn ôn tập của user NHƯNG thuộc một Word Set cụ thể.
 * Set chỉ xác định PHẠM VI từ — FSRS/user_progress vẫn là nguồn sự thật duy nhất
 * (không có FSRS riêng cho từng set). RLS `set_words` đảm bảo chỉ truy cập set của mình.
 * @param {string} userId
 * @param {string} setId
 * @param {number} limit
 */
export async function getDueReviewWordsInSet(userId, setId, limit = REVIEW_QUEUE_LIMIT) {
  if (!userId || !setId) return { data: null, error: { message: 'Thiếu userId hoặc setId.' } };

  const { data: links, error: linkError } = await supabase
    .from('set_words')
    .select('word_sense_id')
    .eq('set_id', setId);
  if (linkError) return { data: null, error: linkError };

  const senseIds = (links || []).map((l) => l.word_sense_id);
  if (senseIds.length === 0) return { data: [], error: null };

  const { data, error } = await supabase
    .from('user_progress')
    .select(SRS_PROGRESS_SELECT)
    .eq('user_id', userId)
    .lte('review_due_at', new Date().toISOString())
    .in('word_sense_id', senseIds)
    .order('review_due_at', { ascending: true })
    .limit(limit);
  if (error) return { data: null, error };

  return { data: (data || []).map(mapProgressRow), error: null };
}


/**
 * Lấy danh sách từ đang trong giai đoạn học (learning/relearning) và chưa tới hạn.
 * @param {string} userId
 * @param {string[] | undefined} senseIds - Optional array of sense IDs to filter by.
 * @param {number} limit
 */
export async function getLearningWords(userId, setId, limit = REVIEW_QUEUE_LIMIT) {
  if (!userId) return { data: [], error: null };

  // STATE FILTER (Part G: session reload fix)
  // Only fetch words that are still in an active learning step — 'learning',
  // 'relearning', or 'new'.  A word that was just rated "Good" graduates to
  // 'review' state with a future review_due_at (e.g. 72 h out).  Without this
  // filter those graduated cards are picked up again on the next reload and
  // reappear in the session, forcing the user to re-study them.
  const ACTIVE_STATES = ['learning', 'relearning', 'new'];

  // Resolve set-scoped sense IDs first so we never pass a large client-side
  // UUID list to .in() (root cause of HTTP 400 on VocabularyDetail with large sets).
  let setSenseIds = null;
  if (setId) {
    const { data: setLinks, error: setError } = await supabase
      .from('set_words')
      .select('word_sense_id')
      .eq('set_id', setId);
    if (setError) return { data: null, error: setError };
    setSenseIds = (setLinks || []).map((l) => l.word_sense_id);
  }

  let query = supabase
    .from('user_progress')
    .select(SRS_PROGRESS_SELECT)
    .eq('user_id', userId)
    .gt('review_due_at', new Date().toISOString())
    .in('state', ACTIVE_STATES)
    .order('review_due_at', { ascending: true })
    .limit(limit);

  if (setSenseIds && setSenseIds.length > 0) {
    query = query.in('word_sense_id', setSenseIds);
  }

  let { data, error } = await query;

  // Fallback: if the 'state' column does not yet exist (old DB), retry with the
  // base column set and apply a client-side filter.  In environments without
  // the state column the SRS scheduler is also absent, so the state filter is
  // best-effort here.
  if (error && isMissingColumn(error, 'state')) {
    let fallbackQuery = supabase
      .from('user_progress')
      .select(BASE_PROGRESS_SELECT)
      .eq('user_id', userId)
      .gt('review_due_at', new Date().toISOString())
      .order('review_due_at', { ascending: true })
      .limit(limit);

    if (setSenseIds && setSenseIds.length > 0) {
      fallbackQuery = fallbackQuery.in('word_sense_id', setSenseIds);
    }

    ({ data, error } = await fallbackQuery);
    if (error) return { data: null, error };
    return { data: (data || []).map(mapProgressRow), error: null };
  }

  if (error) return { data: null, error };

  return { data: (data || []).map(mapProgressRow), error: null };
}

/**
 * Lấy danh sách từ MỚI cho phiên học, tôn trọng thứ tự ưu tiên.
 * @param {string} userId
 * @param {string[]} prioritizedSetIds
 * @param {number} limit
 * @param {string[]} excludedIds - Các sense ID đã có trong queue (due, learning)
 */
export async function getNewWords(userId, prioritizedSetIds, limit, excludedIds = []) {
  if (!userId || limit <= 0) return { data: [], error: null };

  const { data, error } = await supabase.rpc('get_new_words_for_session', {
    p_user_id: userId,
    p_set_ids_prioritized: prioritizedSetIds,
    p_limit: limit,
    p_excluded_sense_ids: excludedIds,
  });

  if (error) {
    if (import.meta.env.DEV) {
      console.error('[getNewWords] RPC Error:', JSON.stringify(error, null, 2));
    }
    return { data: null, error };
  }
  return { data: data || [], error: null };
}


/**
 * Xây dựng hàng đợi cho một phiên học (Unified Learn Engine).
 * @param {string} userId
 * @param {{
 *   learnMode: 'LIMITED' | 'UNLIMITED',
 *   dailyNewLimit: number,
 *   introducedTodayCount: number,
 *   sessionSize?: number,
 *   setId?: string | null,
 * }} options
 * @returns {Promise<{ queue: any[], error: any }>}
 */
export async function getLearnSessionQueue(userId, options) {
  const {
    learnMode = 'LIMITED',
    dailyNewLimit = DEFAULT_DAILY_NEW_LIMIT,
    introducedTodayCount = 0,
    sessionSize = 50,
    setId: rawSetId = null, // Renamed to avoid conflict with effectiveSetId
  } = options;

  let finalQueue = [];
  let error = null;

  try {
    // --- Step 1: Fetch DUE words ---
    // Normalize set scope: 'all' means no set filter (null)
    const effectiveSetId = rawSetId === 'all' ? null : rawSetId;
    const { data: dueWords, error: dueError } = effectiveSetId
      ? await getDueReviewWordsInSet(userId, effectiveSetId, sessionSize)
      : await getDueReviewWords(userId, sessionSize);

    if (dueError) throw dueError;
    finalQueue.push(...(dueWords || []));

    const currentIds = new Set(finalQueue.map(w => w.id));
    let remainingSize = sessionSize - finalQueue.length;

        // --- Step 2: Fetch LEARNING words ---
    if (remainingSize > 0) {
      // Pass effectiveSetId directly to getLearningWords, which resolves
      // the set's word_sense_ids server-side via set_words. This avoids
      // building a large client-side UUID list that triggers HTTP 400.
      const { data: learningWords, error: learningError } = await getLearningWords(
        userId,
        effectiveSetId,
        remainingSize
      );
      if (learningError) throw learningError;

      (learningWords || []).forEach(word => {
        if (!currentIds.has(word.id)) {
          finalQueue.push(word);
          currentIds.add(word.id);
        }
      });
    }

    remainingSize = sessionSize - finalQueue.length;

    // --- Step 3: Fetch NEW words ---
    if (remainingSize > 0) {
      let newWordLimit = 0;
      if (learnMode === 'LIMITED') {
        newWordLimit = Math.max(0, dailyNewLimit - introducedTodayCount);
      } else {
        newWordLimit = sessionSize; // For UNLIMITED, fetch up to a full batch
      }

      const finalNewLimit = Math.min(remainingSize, newWordLimit);

      if (finalNewLimit > 0) {
        let prioritizedSetIds = [];
        if (effectiveSetId) { // Use effectiveSetId
            prioritizedSetIds = [effectiveSetId]; // Use effectiveSetId
        } else {
            // Fetch user's set priorities to order new cards
            const { data: priorities, error: prioError } = await supabase.rpc('get_user_set_learn_priorities', { p_user_id: userId });
            if (prioError) console.warn('Could not fetch set priorities, using default order.', prioError);
            
            // Get the user's set ids (created_at ASC keeps the order
            // deterministic even before priorities are normalized — never
            // load the set_words/vocabulary themselves, only ids + timestamps).
            const { data: allSets, error: setsError } = await supabase
              .from('vocabulary_sets')
              .select('id, created_at')
              .eq('user_id', userId)
              .order('created_at', { ascending: true });
            if(setsError) throw setsError;

            // Merge priorities (missing entry => appended last, priority 999)
            // and sort deterministically: priority ASC, created_at ASC, id ASC.
            const prioMap = new Map((priorities || []).map(p => [p.set_id, p.learn_priority]));
            const allSetIdsWithPrio = (allSets || []).map(s => ({
              id: s.id,
              created_at: s.created_at || '',
              priority: prioMap.get(s.id) ?? 999,
            }));
            allSetIdsWithPrio.sort((a, b) => {
              if (a.priority !== b.priority) return a.priority - b.priority;
              const ta = new Date(a.created_at || 0).getTime() || 0;
              const tb = new Date(b.created_at || 0).getTime() || 0;
              if (ta !== tb) return ta - tb;
              return String(a.id).localeCompare(String(b.id));
            });

            prioritizedSetIds = allSetIdsWithPrio.map(s => s.id);
        }

        if (prioritizedSetIds.length > 0) {
            const { data: newWords, error: newWordsError } = await getNewWords(
                userId,
                prioritizedSetIds,
                finalNewLimit,
                Array.from(currentIds)
            );
            if (newWordsError) throw newWordsError;

             (newWords || []).forEach(word => {
                if (!currentIds.has(word.id)) {
                    finalQueue.push(word);
                    currentIds.add(word.id);
                }
            });
        }
      }
    }

    return { queue: finalQueue, error: null };

  } catch (e) {
    console.error("Error building learn session queue:", e);
    error = e;
    return { queue: [], error };
  }
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

// ---- Daily NEW limit persistence (user_settings + daily_new_progress) ----
// Quota is tracked per (user, UTC day). The NEW words a user introduces today
// are recorded by word_sense_id so reloads never reset the daily quota.

/**
 * Read the user's `daily_new_limit` setting.
 * Missing row / unconfigured user → DEFAULT_DAILY_NEW_LIMIT (10).
 * Tolerates both a raw-number and a `{ value: N }` jsonb shape.
 * @param {string} userId
 * @returns {Promise<{ value: number, error: object|null }>}
 */
export async function getUserDailyNewLimit(userId) {
  if (!userId) return { value: DEFAULT_DAILY_NEW_LIMIT, error: null };
  try {
    const { data, error } = await supabase
      .from('user_settings')
      .select('value_jsonb')
      .eq('user_id', userId)
      .eq('key', DAILY_NEW_LIMIT_KEY)
      .maybeSingle();
    if (error && error.code !== 'PGRST116') throw error;
    const raw = data?.value_jsonb;
    const num = typeof raw === 'number' ? raw : raw && raw.value;
    return { value: resolveDailyNewLimit(num), error: null };
  } catch (e) {
    // Never block a learning session because the setting can't be read.
    return { value: DEFAULT_DAILY_NEW_LIMIT, error: e };
  }
}

/**
 * word_sense_ids already introduced to the user today (persist across reloads).
 * @param {string} userId
 * @param {string} [dateKey] — defaults to the current UTC day
 * @returns {Promise<{ data: string[], error: object|null }>}
 */
export async function getDailyNewProgress(userId, dateKey) {
  const key = dateKey || getDailyDateKey();
  if (!userId) return { data: [], error: null };
  try {
    const { data, error } = await supabase
      .from('daily_new_progress')
      .select('word_sense_id')
      .eq('user_id', userId)
      .eq('day', key);
    if (error) return { data: [], error };
    return {
      data: (data || []).map((r) => r.word_sense_id).filter(Boolean),
      error: null,
    };
  } catch (e) {
    return { data: [], error: e };
  }
}

/**
 * Record that a NEW word_sense_id was introduced to the user today.
 * Upsert is idempotent: introducing the same card twice never counts twice.
 * @param {string} userId
 * @param {string} wordSenseId
 * @param {string} [dateKey]
 * @returns {Promise<{ error: object|null }>}
 */
export async function markDailyNewIntroduced(userId, wordSenseId, dateKey) {
  const key = dateKey || getDailyDateKey();
  if (!userId || !wordSenseId) {
    return { error: { message: 'Thiếu userId hoặc wordSenseId.' } };
  }
  try {
    const { error } = await supabase
      .from('daily_new_progress')
      .upsert(
        { user_id: userId, day: key, word_sense_id: wordSenseId },
        { onConflict: 'user_id,day,word_sense_id' }
      );
    return { error: error ?? null };
  } catch (e) {
    return { error: e };
  }
}

/**
 * Persist the user's daily_new_limit setting (idempotent upsert).
 * @param {string} userId
 * @param {*} value
 * @returns {Promise<{ value: number, error: object|null }>}
 */
export async function updateDailyNewLimit(userId, value) {
  const limit = resolveDailyNewLimit(value);
  if (!userId) return { value: limit, error: { message: 'Thiếu userId.' } };
  try {
    const { error } = await supabase
      .from('user_settings')
      .upsert(
        { user_id: userId, key: DAILY_NEW_LIMIT_KEY, value_jsonb: limit },
        { onConflict: 'user_id,key' }
      );
    return { value: limit, error: error ?? null };
  } catch (e) {
    return { value: limit, error: e };
  }
}

/**
 * Lấy thống kê vốn từ của người dùng (tổng số, đang học).
 * @param {string} userId
 * @returns {Promise<{ data: { total_count: number, learning_count: number } | null, error: object | null }>}
 */
export async function getVocabularyStats(userId) {
  if (!userId) return { data: null, error: { message: 'Thiếu userId.' } };
  try {
    // SINGLE SOURCE OF TRUTH — query the SAME tables used by the Learning
    // Session queue (user_progress) and Vocabulary Library (user_vocabulary)
    // instead of the separate get_user_vocabulary_stats RPC.  The RPC could
    // silently return 0/0 when the function was undeployed or lacked
    // execution privileges, while getLearnSessionQueue still found review
    // cards from user_progress — causing the "0/50" mismatch.
    const [vocabRes, progRes] = await Promise.all([
      supabase
        .from('user_vocabulary')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId),
      supabase
        .from('user_progress')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId),
    ]);

    if (vocabRes.error || progRes.error) {
      return { data: null, error: vocabRes.error || progRes.error };
    }

    const total = vocabRes.count ?? 0;
    const learning = progRes.count ?? 0;
    return { data: { total_count: total, learning_count: learning }, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}
