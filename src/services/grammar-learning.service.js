import { supabase } from './supabase.js';
import { computeSrsPayload, RATING } from './srs.service.js';
import { MASTERY_MAX, MASTERY_MIN } from './learning.service.js';
import { buildGrammarSessionQueue } from '../utils/grammar-status.js';

/**
 * Dịch vụ Grammar Learning + SRS.
 *
 * TÁI SỬ DỤNG scheduler hiện tại: `computeSrsPayload(prog, rating, ids)` là
 * pure và generic (Vocabulary dùng cho user_progress, Structure dùng cho
 * user_structures). Với Grammar, ta gọi `computeSrsPayload(existing, rating,
 * { userId })` rồi map SRS fields sang user_grammar (thay structure_id bằng
 * rule_id). KHÔNG viết scheduler mới, KHÔNG sửa src/services/srs.service.js,
 * KHÔNG thêm stability/difficulty — MỘT SRS engine cho toàn EngFore.
 *
 * SRS mapping:
 *   Vocabulary -> user_progress(user_id, word_sense_id)
 *   Structure  -> user_structures(user_id, structure_id)
 *   Grammar    -> user_grammar(user_id, rule_id)
 * Các field SRS giữ nguyên: state, learning_step, repetitions, interval_hours,
 * ease_factor, lapses, review_count, review_due_at, last_reviewed_at.
 *
 * INVARIANTS (mirror structure-learning.service.js):
 *   - ONE user + ONE grammar rule = ĐÚNG MỘT SRS state row (PK composite).
 *   - Exercises là phương tiện đánh giá: KHÔNG bao giờ có thẻ SRS riêng theo
 *     exercise — upsert payload dưới đây không bao giờ chứa exercise_id.
 *   - Rating model tái sử dụng: AGAIN/HARD/GOOD/EASY, áp dụng MỘT lần sau khi
 *     hoàn thành exercise set của rule; last_rating persist trên CÙNG thẻ SRS
 *     để lần gặp kế tiếp phân biệt behavior (mirror user_structures.last_rating).
 */

const GRAMMAR_QUEUE_SELECT = `
  id, topic_id, title, rule, explanation, created_at,
  grammar_topics(id, title, cefr)
`;

/**
 * Lấy queue phiên học Grammar theo thứ tự DUE → LEARNING → NEW.
 * - DUE     : user_grammar.state='review' VÀ review_due_at <= now
 * - LEARNING: user_grammar.state IN ('learning','relearning')
 * - NEW     : chưa có user_grammar HOẶC state='new'
 * Review chưa tới hạn bị LOẠI khỏi queue.
 *
 * MVP: CHƯA có daily-new limit riêng cho Grammar (queue trả đủ ba nhóm —
 * mirror getStructureSessionQueue khi không truyền options). Bucket/sort logic
 * TÁI SỬ DỤNG từ utils/grammar-status.js — cùng SRS engine với Vocabulary/
 * Structure.
 *
 * RLS giới hạn đúng user hiện tại (lọc .eq('user_id')).
 *
 * @param {string} userId
 * @returns {Promise<{ data: Array|null, error: any }>}
 */
export async function getGrammarSessionQueue(userId) {
  if (!userId) return { data: null, error: { message: 'Thiếu userId.' } };
  try {
    const [rulesRes, progRes] = await Promise.all([
      supabase.from('grammar_rules').select(GRAMMAR_QUEUE_SELECT),
      supabase.from('user_grammar').select('*').eq('user_id', userId),
    ]);
    if (rulesRes.error) return { data: null, error: rulesRes.error };
    if (progRes.error) return { data: null, error: progRes.error };

    const progressMap = {};
    (progRes.data || []).forEach((p) => {
      progressMap[p.rule_id] = p;
    });

    // Flatten topic info lên item để UI hiển thị (topic title + CEFR của topic).
    const rules = (rulesRes.data || []).map((r) => ({
      ...r,
      topic_title: r.grammar_topics?.title || null,
      cefr: r.grammar_topics?.cefr || null,
    }));

    const queue = buildGrammarSessionQueue(rules, progressMap);
    return { data: queue, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

/**
 * Ghi kết quả rating cho (user, grammar rule) và cập nhật SRS.
 * Flow (MIRROR recordStructureResult — cùng scheduler):
 *   existing user_grammar
 *     -> computeSrsPayload(existing, rating, { userId })   (reuse scheduler)
 *     -> map SRS fields sang user_grammar + mastery/review_count
 *     -> upsert user_grammar (PK user_id, rule_id)
 *     -> trả progress mới
 *
 * KHÔNG cập nhật grammar content / exercise — SRS chỉ thuộc (user, rule).
 *
 * @param {{ userId: string, ruleId: string, rating: number }} params
 * @returns {Promise<{ progress: object|null, error: any }>}
 */
export async function recordGrammarResult({ userId, ruleId, rating }) {
  if (!userId || !ruleId || typeof rating === 'undefined') {
    return { progress: null, error: { message: 'Thiếu userId, ruleId hoặc rating.' } };
  }
  try {
    // Lấy progress hiện tại (có thể null với rule chưa học).
    const { data: existing } = await supabase
      .from('user_grammar')
      .select('*')
      .eq('user_id', userId)
      .eq('rule_id', ruleId)
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
      rule_id: ruleId,
      mastery_level: nextMastery,
      state: srs.state,
      learning_step: srs.learning_step,
      repetitions: srs.repetitions,
      interval_hours: srs.interval_hours,
      ease_factor: srs.ease_factor,
      lapses: srs.lapses,
      // Persist rating người dùng vừa chọn (0=Again, 2=Hard, 3=Good, 4=Easy)
      // trên CÙNG thẻ SRS để phiên học kế phân biệt HARD vs GOOD/EASY.
      // Metadata buổi gặp — KHÔNG phải field scheduler.
      last_rating: Number(rating),
      review_count: currentReviewCount + 1,
      review_due_at: srs.review_due_at,
      last_reviewed_at: srs.last_reviewed_at,
    };

    const { data, error } = await supabase
      .from('user_grammar')
      .upsert(upsertPayload, { onConflict: 'user_id,rule_id' })
      .select()
      .maybeSingle();

    if (error) {
      if (import.meta.env.DEV) {
        console.error('[recordGrammarResult] upsert error:', error?.message);
      }
      return { progress: null, error };
    }
    return { progress: data || upsertPayload, error: null };
  } catch (err) {
    return { progress: null, error: err };
  }
}

/**
 * Thống kê học tập Grammar của user (cho /learn area counters).
 *   - new     : rule chưa có user_grammar + state='new'
 *   - again   : learning + relearning
 *   - review  : state='review' (đã học, có lịch ôn)
 *   - due     : review đã tới hạn
 * Mirror getStructureSrsStats (client-side aggregation trên 2 query).
 *
 * @param {string} userId
 * @returns {Promise<{ data: object|null, error: any }>}
 */
export async function getGrammarSrsStats(userId) {
  if (!userId) return { data: null, error: { message: 'Thiếu userId.' } };
  try {
    const [rulesRes, progRes] = await Promise.all([
      supabase.from('grammar_rules').select('id', { count: 'exact', head: true }),
      supabase.from('user_grammar').select('state, review_due_at, rule_id').eq('user_id', userId),
    ]);
    if (rulesRes.error) return { data: null, error: rulesRes.error };
    if (progRes.error) return { data: null, error: progRes.error };

    const total = rulesRes.count ?? 0;
    const rows = progRes.data || [];
    const now = new Date().toISOString();
    const withProgress = new Set();

    let learning = 0;
    let relearning = 0;
    let review = 0;
    let due = 0;

    (rows || []).forEach((p) => {
      withProgress.add(p.rule_id);
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