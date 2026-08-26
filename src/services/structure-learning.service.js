import { supabase } from './supabase.js';
import { computeSrsPayload, RATING } from './srs.service.js';
import { MASTERY_MAX, MASTERY_MIN } from './learning.service.js';
import { buildStructureSessionQueue } from '../utils/structure-status.js';

/**
 * Dịch vụ Structure Learning + SRS (CHECKPOINT 5+6).
 *
 * TÁI SỬ DỤNG scheduler hiện tại: `computeSrsPayload(prog, rating, ids)` là
 * pure và generic (Vocabulary dùng cho user_progress). Với Structure, ta gọi
 * `computeSrsPayload(existing, rating, { userId })` rồi map sang user_structures
 * (thay word_sense_id bằng structure_id). KHÔNG viết scheduler mới, KHÔNG sửa
 * src/services/srs.service.js, KHÔNG thêm stability/difficulty.
 *
 * SRS mapping:
 *   Vocabulary -> user_progress(user_id, word_sense_id)
 *   Structure  -> user_structures(user_id, structure_id)
 * Các field SRS giữ nguyên: state, learning_step, repetitions, interval_hours,
 * ease_factor, lapses, review_count, review_due_at, last_reviewed_at.
 *
 * INVARIANTS (Exercise ↔ Knowledge ↔ SRS):
 *   - MỌI structure_exercises row mang `structure_id` (FK NOT NULL,
 *     ON DELETE CASCADE). Pattern text CHỈ là lookup key lúc import;
 *     runtime định danh structure bằng uuid.
 *   - ONE user + ONE structure = ĐÚNG MỘT SRS state row (PK composite).
 *   - Exercises là phương tiện đánh giá: KHÔNG bao giờ có thẻ SRS riêng theo
 *     exercise — upsert payload dưới đây không bao giờ chứa exercise_id.
 *   - Rating model tái sử dụng từ Vocabulary: RATING AGAIN/HARD/GOOD/EASY,
 *     áp dụng MỘT lần sau khi hoàn thành exercise set của structure
 *     (self-rating UX — không tự map wrong/correct thành rating).
 *     Rating vừa chọn được LƯU VÀO user_structures.last_rating (cùng thẻ SRS,
 *     không tạo thẻ mới) để lần gặp kế tiếp phân biệt behavior:
 *       AGAIN/HARD/không rõ -> random guided  |  GOOD/EASY -> random pure test.
 */

const STRUCTURE_CORE_SELECT = 'id, pattern, meaning, explanation, cefr, topic, created_at';

/**
 * Lấy queue phiên học Structure theo thứ tự DUE → LEARNING → NEW.
 * - DUE    : user_structures.state='review' VÀ review_due_at <= now
 * - LEARNING: user_structures.state IN ('learning','relearning')
 * - NEW    : chưa có user_structures HOẶC state='new'
 * Review chưa tới hạn bị LOẠI khỏi queue.
 *
 * RLS giới hạn đúng user hiện tại (lọc .eq('user_id')).
 *
 * @param {string} userId
 * @returns {Promise<{ data: Array|null, error: any }>}
 */
export async function getStructureSessionQueue(userId) {
  if (!userId) return { data: null, error: { message: 'Thiếu userId.' } };
  try {
    const [structRes, progRes] = await Promise.all([
      supabase.from('structures').select(STRUCTURE_CORE_SELECT),
      supabase.from('user_structures').select('*').eq('user_id', userId),
    ]);
    if (structRes.error) return { data: null, error: structRes.error };
    if (progRes.error) return { data: null, error: progRes.error };

    const progressMap = {};
    (progRes.data || []).forEach((p) => {
      progressMap[p.structure_id] = p;
    });

    const queue = buildStructureSessionQueue(structRes.data || [], progressMap);
    return { data: queue, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

/**
 * Ghi kết quả rating cho (user, structure) và cập nhật SRS.
 * Flow:
 *   existing user_structures
 *     -> computeSrsPayload(existing, rating, { userId })   (reuse scheduler)
 *     -> map SRS fields sang user_structures + mastery/review_count
 *     -> upsert user_structures (PK user_id, structure_id)
 *     -> trả progress mới
 *
 * KHÔNG cập nhật structure content / exercise — SRS chỉ thuộc (user, structure).
 *
 * @param {{ userId: string, structureId: string, rating: number }} params
 * @returns {Promise<{ progress: object|null, error: any }>}
 */
export async function recordStructureResult({ userId, structureId, rating }) {
  if (!userId || !structureId || typeof rating === 'undefined') {
    return { progress: null, error: { message: 'Thiếu userId, structureId hoặc rating.' } };
  }
  try {
    // Lấy progress hiện tại (có thể null với structure chưa học).
    const { data: existing } = await supabase
      .from('user_structures')
      .select('*')
      .eq('user_id', userId)
      .eq('structure_id', structureId)
      .maybeSingle();

    // Reuse scheduler — computeSrsPayload là PURE (không chạm DB).
    const { progress: srs, error: srsErr } = computeSrsPayload(existing || {}, rating, {
      userId,
    });
    if (srsErr) throw srsErr;

    // Mastery: mapping giống recordLearningResult (rating >= HARD = correct).
    const currentMastery = existing?.mastery_level ?? 0;
    const currentReviewCount = existing?.review_count ?? 0;
    const isCorrect = Number(rating) >= RATING.HARD;
    const nextMastery = isCorrect
      ? Math.min(currentMastery + 1, MASTERY_MAX)
      : Math.max(currentMastery - 1, MASTERY_MIN);

    const upsertPayload = {
      user_id: userId,
      structure_id: structureId,
      mastery_level: nextMastery,
      state: srs.state,
      learning_step: srs.learning_step,
      repetitions: srs.repetitions,
      interval_hours: srs.interval_hours,
      ease_factor: srs.ease_factor,
      lapses: srs.lapses,
      // Persist rating người dùng vừa chọn (0=Again, 2=Hard, 3=Good, 4=Easy)
      // trên CÙNG thẻ SRS để phiên học kế phân biệt HARD vs GOOD/EASY. Đây là
      // metadata buổi gặp, KHÔNG phải field scheduler — computeSrsPayload giữ
      // nguyên hoàn toàn.
      last_rating: Number(rating),
      review_count: currentReviewCount + 1,
      review_due_at: srs.review_due_at,
      last_reviewed_at: srs.last_reviewed_at,
    };

    const { data, error } = await supabase
      .from('user_structures')
      .upsert(upsertPayload, { onConflict: 'user_id,structure_id' })
      .select()
      .maybeSingle();

    if (error) {
      if (import.meta.env.DEV) {
        console.error('[recordStructureResult] upsert error:', error?.message);
      }
      return { progress: null, error };
    }
    return { progress: data || upsertPayload, error: null };
  } catch (err) {
    return { progress: null, error: err };
  }
}

/**
 * Thống kê học tập Structure của user (cho library/dashboard counters).
 *   - new     : structure chưa có user_structures + state='new'
 *   - again   : learning + relearning
 *   - review  : state='review' (đã học, có lịch ôn)
 *   - due     : review đã tới hạn
 *   - learning/relearning counts riêng.
 *
 * @param {string} userId
 * @returns {Promise<{ data: object|null, error: any }>}
 */
export async function getStructureSrsStats(userId) {
  if (!userId) return { data: null, error: { message: 'Thiếu userId.' } };
  try {
    const [structRes, progRes] = await Promise.all([
      supabase.from('structures').select('id', { count: 'exact', head: true }),
      supabase.from('user_structures').select('state, review_due_at, structure_id').eq('user_id', userId),
    ]);
    if (structRes.error) return { data: null, error: structRes.error };
    if (progRes.error) return { data: null, error: progRes.error };

    const total = structRes.count ?? 0;
    const rows = progRes.data || [];
    const now = new Date().toISOString();
    const withProgress = new Set();

    let learning = 0;
    let relearning = 0;
    let review = 0;
    let due = 0;

    (rows || []).forEach((p) => {
      withProgress.add(p.structure_id);
      if (p.state === 'learning') learning += 1;
      else if (p.state === 'relearning') relearning += 1;
      else if (p.state === 'review') {
        review += 1;
        if (p.review_due_at && p.review_due_at <= now) due += 1;
      }
    });

    const newCount = Math.max(0, total - withProgress.size);

    return {
      data: {
        total,
        new: newCount,
        learning,
        relearning,
        review,
        again: learning + relearning,
        due,
      },
      error: null,
    };
  } catch (e) {
    return { data: null, error: e };
  }
}