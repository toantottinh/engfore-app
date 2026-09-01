/**
 * Pure helpers cho Grammar SRS trong khu học ngắt quãng (/learn).
 *
 * REUSE TRỰC TIẾP (một SRS engine — không scheduler mới):
 *   - Bucket theo state (structureQueueBucket), derive status, exercise plan
 *     (resolveStructureExercisePlan), stable order, random pick — TẤT CẢ được
 *     tái sử dụng nguyên văn từ structure-status.js vì chúng là THUẦN trên
 *     progress row {state, review_due_at, last_rating, ...} — cùng shape với
 *     user_grammar. Chỉ khác TÊN field của content: rule thay vì structure.
 *
 * Grammar-specific (mỏng, chỉ mapping field + sort):
 *   - buildGrammarSessionQueue / partitionGrammarQueue / countGrammarStates
 *   - grammarSessionPath (single source — khớp route trong src/App.jsx)
 *
 * Invariants giữ nguyên (mirror user_structures):
 *   - NEW bao gồm rule CHƯA có row user_grammar (không tạo row chỉ vì load).
 *   - review chưa tới hạn bị LOẠI khỏi queue.
 *   - ruleId (UUID) là định danh runtime; title/rule chỉ để hiển thị.
 */

import {
  structureQueueBucket,
  deriveStructureStatus,
  resolveStructureExercisePlan,
  isSequentialStructureProgress,
  orderStructureExercisesStable,
  selectRandomStructureExercise,
  STRUCTURE_SEQUENCE_LIMIT,
} from './structure-status.js';

// ------------------------------------------------------------------
// RE-EXPORT các pure helpers dùng chung (một SRS engine cho toàn EngFore).
// ------------------------------------------------------------------

/** Bucket SRS cho một progress row — generic theo {state, review_due_at}. */
export const grammarQueueBucket = structureQueueBucket;

/** Derive trạng thái hiển thị {key: 'new'|'again'|'review', label} — generic. */
export const deriveGrammarStatus = deriveStructureStatus;

/** NEW/AGAIN -> sequence; review -> false. Generic theo state. */
export const isSequentialGrammarProgress = isSequentialStructureProgress;

/** Sắp exercise ổn định theo created_at/id — generic theo row shape. */
export const orderGrammarExercisesStable = orderStructureExercisesStable;

/** Random đúng một exercise từ bank — generic. */
export const selectRandomGrammarExercise = selectRandomStructureExercise;

/**
 * Kế hoạch gặp một Grammar Rule trong phiên học.
 * REUSE TRỰC TIẾP resolveStructureExercisePlan — plan logic là thuần trên
 * (progress, bank) và grammar_exercises có CÙNG shape với structure_exercises
 * (type/question/answer/options/explanation), nên checker + renderer hiện có
 * hoạt động không đổi.
 */
export const resolveGrammarExercisePlan = resolveStructureExercisePlan;

export const GRAMMAR_SEQUENCE_LIMIT = STRUCTURE_SEQUENCE_LIMIT;

// ------------------------------------------------------------------
// GRAMMAR QUEUE — DUE → LEARNING → NEW (mirror buildStructureSessionQueue,
// chỉ khác field định danh: ruleId + user_grammar).
// ------------------------------------------------------------------

/**
 * Xây queue phiên học Grammar: DUE (review_due_at asc) → LEARNING
 * (review_due_at asc) → NEW (created_at asc). Rule review chưa tới hạn bị LOẠI.
 *
 * @param {Array} rules - grammar rules (có thể kèm topic info để hiển thị)
 * @param {Map<string,object>|Record<string,object>} progressMap - rule_id -> user_grammar
 * @returns {Array} queue, mỗi item {...rule, ruleId, user_grammar}
 */
export function buildGrammarSessionQueue(rules, progressMap = {}) {
  const nowIso = new Date().toISOString();
  const due = [];
  const learning = [];
  const fresh = [];

  (rules || []).forEach((r) => {
    const prog =
      (typeof progressMap.get === 'function' ? progressMap.get(r.id) : null) ||
      progressMap[r.id] ||
      null;
    const bucket = grammarQueueBucket(prog, nowIso);
    const item = { ...r, ruleId: r.id, user_grammar: prog };
    if (bucket === 'due') due.push(item);
    else if (bucket === 'learning') learning.push(item);
    else if (bucket === 'new') fresh.push(item);
    // 'review-future' -> bỏ qua
  });

  const byDue = (a, b) =>
    String(a.user_grammar?.review_due_at || '').localeCompare(
      String(b.user_grammar?.review_due_at || '')
    );
  const byCreated = (a, b) =>
    String(a.created_at || '').localeCompare(String(b.created_at || ''));

  due.sort(byDue);
  learning.sort(byDue);
  fresh.sort(byCreated);

  return [...due, ...learning, ...fresh];
}

/**
 * Chia queue Grammar thành ba nhóm DUE / LEARNING / NEW cho UI /learn
 * (mirror partitionStructureQueue — cùng bucket semantics).
 *
 * @param {Array} queue - output của buildGrammarSessionQueue
 * @param {string} [nowIso]
 * @returns {{ due: Array, learning: Array, new: Array }}
 */
export function partitionGrammarQueue(queue, nowIso = new Date().toISOString()) {
  const sections = { due: [], learning: [], new: [] };
  (queue || []).forEach((item) => {
    const bucket = grammarQueueBucket(item?.user_grammar || null, nowIso);
    if (bucket === 'due') sections.due.push(item);
    else if (bucket === 'learning') sections.learning.push(item);
    else if (bucket === 'new') sections.new.push(item);
    // 'review-future' -> bỏ qua (phòng thủ; builder đã loại trước)
  });
  return sections;
}

/**
 * Đếm theo trạng thái hiển thị cho grammar rules — keys khớp StatusCounts.
 * NEW tính cả rule CHƯA có user_grammar (không = 0).
 * @param {Array} rules - rules kèm `user_grammar`
 * @returns {{ new: number, again: number, review: number }}
 */
export function countGrammarStates(rules) {
  const counts = { new: 0, again: 0, review: 0 };
  (rules || []).forEach((r) => {
    const { key } = deriveGrammarStatus(r.user_grammar || null);
    counts[key] += 1;
  });
  return counts;
}

/**
 * Đường dẫn Grammar Session cho một ruleId (single source — khớp route trong
 * src/App.jsx). Mirror structureSessionPath: session thuộc content area,
 * /learn queue chỉ điều hướng tới.
 * @param {string} ruleId
 * @returns {string}
 */
export function grammarSessionPath(ruleId) {
  return `/grammar/session/${ruleId}`;
}