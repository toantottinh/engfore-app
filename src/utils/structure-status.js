/**
 * Pure helpers xác định trạng thái học của một Structure cho một user
 * (từ user_structures) + bộ lọc/đếm cho Structure Library.
 *
 * Ràng buộc (QUAN TRỌNG — mục 16 CHECKPOINT 4):
 *   NEW phải BAO GỒM các structure CHƯA có rows trong user_structures.
 *   Không tạo user_structures cho toàn bộ structures chỉ vì mở Library —
 *   structures chưa học chỉ được coi là NEW theo logic thuần, không ghi DB.
 *
 * Semantics khớp convention Vocabulary / StatusCounts:
 *   new        -> 🟢 Mới       (chưa học: không có row hoặc state='new')
 *   learning/relearning -> 🔴 Again (đang học)
 *   review     -> 🟡 Ôn        (state='review')
 */

/**
 * Derive trạng thái hiển thị của một structure theo user_structures (hoặc null).
 * @param {object|null} progress - row user_structures (id, state, review_due_at, mastery_level, ...) hoặc null
 * @returns {{ key: 'new'|'again'|'review', label: string, progress: object|null }}
 */
export function deriveStructureStatus(progress) {
  const state = progress?.state || 'new';
  if (state === 'learning' || state === 'relearning') {
    return { key: 'again', label: 'Đang học', progress };
  }
  if (state === 'review') {
    return { key: 'review', label: 'Ôn', progress };
  }
  // state === 'new' hoặc chưa có row -> Mới
  return { key: 'new', label: 'Mới', progress };
}

/**
 * Count theo trạng thái cho StatusCounts — keys khớp component StatusCounts.
 * NEW tính cả structure CHƯA có user_structures (quan trọng: không = 0).
 * @param {Array} structures - danh sách structure kèm `user_structures`
 * @returns {{ new: number, again: number, review: number }}
 */
export function countStructureStates(structures) {
  const counts = { new: 0, again: 0, review: 0 };
  (structures || []).forEach((s) => {
    const { key } = deriveStructureStatus(s.user_structures || null);
    counts[key] += 1;
  });
  return counts;
}

/**
 * Key chuẩn hóa cho việc tìm kiếm/lọc (case-insensitive).
 */
function normalize(value) {
  return String(value || '').toLowerCase().trim();
}

/**
 * Lọc danh sách structure theo search + CEFR + Topic + Status.
 * Search chạy trên pattern/meaning/topic (case-insensitive, dùng /includes/).
 * @param {Array} structures - structures kèm `user_structures`
 * @param {{ search?: string, cefr?: string, topic?: string, status?: 'all'|'new'|'learning'|'review' }} options
 * @returns {Array}
 */
export function filterStructures(structures, options = {}) {
  const search = (options.search || '').toLowerCase().trim();
  const cefr = (options.cefr || '').toUpperCase().trim();
  const topic = (options.topic || '').trim();
  const status = (options.status || 'all').toLowerCase();

  return (structures || []).filter((s) => {
    if (search) {
      const haystack = [s.pattern, s.meaning, s.topic].map(normalize).join(' ');
      if (!haystack.includes(search)) return false;
    }
    if (cefr && s.cefr !== cefr) return false;
    if (topic && s.topic !== topic) return false;

    if (status !== 'all') {
      const derived = deriveStructureStatus(s.user_structures || null);
      if (status === 'new' && derived.key !== 'new') return false;
      // 'learning' bucket bao gồm cả lại/học — map vào 'again'
      if (status === 'learning' && derived.key !== 'again') return false;
      if (status === 'review' && derived.key !== 'review') return false;
    }
    return true;
  });
}

/**
 * Danh sách topic distinct từ structures, sort alphabetically.
 * @param {Array} structures
 * @returns {string[]}
 */
export function distinctStructureTopics(structures) {
  return [...new Set((structures || []).map((s) => s.topic).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
}

// ------------------------------------------------------------------
// SESSION QUEUE (CHECKPOINT 5) — thứ tự DUE → LEARNING → NEW, giống Vocabulary.
// ------------------------------------------------------------------

/**
 * Xếp loại thứ tự của một structure theo user_structures cho session queue.
 * @param {object|null} progress - user_structures hoặc null
 * @returns {'due'|'learning'|'review-future'|'new'}
 *   - 'due'           : state='review' VÀ review_due_at <= now  -> vào queue trước
 *   - 'learning'      : state='learning'|'relearning'            -> vào queue giữa
 *   - 'new'           : chưa có row hoặc state='new'             -> vào queue cuối
 *   - 'review-future' : state='review' nhưng chưa tới hạn        -> KHÔNG vào queue
 */
export function structureQueueBucket(progress, nowIso = new Date().toISOString()) {
  const state = progress?.state || 'new';
  if (state === 'review') {
    return progress?.review_due_at && String(progress.review_due_at) <= nowIso
      ? 'due'
      : 'review-future';
  }
  if (state === 'learning' || state === 'relearning') return 'learning';
  return 'new';
}

/**
 * Xây queue phiên học: DUE (theo review_due_at asc) → LEARNING (review_due_at
 * asc) → NEW (created_at asc). Các structure review chưa tới hạn bị LOẠI.
 *
 * MỖI item mang `structureId` (stable UUID identity — CHECKPOINT 7). Runtime
 * ĐỊNH DANH structure bằng id này; `pattern` chỉ dùng để hiển thị.
 *
 * @param {Array} structures - structure objects (có thể chưa có progress)
 * @param {Map<string,object>|Record<string,object>} progressMap - structure_id -> user_structures
 * @returns {Array} queue đã xếp thứ tự, mỗi item là {...structure, structureId, user_structures}
 */
export function buildStructureSessionQueue(structures, progressMap = {}) {
  const nowIso = new Date().toISOString();
  const due = [];
  const learning = [];
  const fresh = [];

  (structures || []).forEach((s) => {
    const prog =
      (typeof progressMap.get === 'function' ? progressMap.get(s.id) : null) ||
      progressMap[s.id] ||
      null;
    const bucket = structureQueueBucket(prog, nowIso);
    const item = { ...s, structureId: s.id, user_structures: prog };
    if (bucket === 'due') due.push(item);
    else if (bucket === 'learning') learning.push(item);
    else if (bucket === 'new') fresh.push(item);
    // 'review-future' -> bỏ qua
  });

  const byDue = (a, b) =>
    String(a.user_structures?.review_due_at || '').localeCompare(
      String(b.user_structures?.review_due_at || '')
    );
  const byCreated = (a, b) =>
    String(a.created_at || '').localeCompare(String(b.created_at || ''));

  due.sort(byDue);
  learning.sort(byDue);
  fresh.sort(byCreated);

  return [...due, ...learning, ...fresh];
}

// ------------------------------------------------------------------
// UNIFIED LEARN INTEGRATION (CHECKPOINT 7)
// Structure tham gia khu vực học ngắt quãng /learn bằng CHÍNH queue
// user_structures ở trên — không tạo hệ thống queue thứ hai.
// ------------------------------------------------------------------

/**
 * Chia một queue đã xây (buildStructureSessionQueue / getStructureSessionQueue)
 * thành ba nhóm hiển thị DUE / LEARNING / NEW cho UI (/learn area).
 * Thứ tự trong từng nhóm GIỮ NGUYÊN thứ tự queue (đã sort ở builder);
 * 'review-future' không bao giờ xuất hiện vì builder đã loại trước.
 *
 * @param {Array} queue - output của buildStructureSessionQueue
 * @param {string} [nowIso]
 * @returns {{ due: Array, learning: Array, new: Array }}
 */
export function partitionStructureQueue(queue, nowIso = new Date().toISOString()) {
  const sections = { due: [], learning: [], new: [] };
  (queue || []).forEach((item) => {
    const bucket = structureQueueBucket(item?.user_structures || null, nowIso);
    if (bucket === 'due') sections.due.push(item);
    else if (bucket === 'learning') sections.learning.push(item);
    else if (bucket === 'new') sections.new.push(item);
    // 'review-future' -> bỏ qua (phòng thủ; builder đã loại)
  });
  return sections;
}

/**
 * Đường dẫn Structure Learning Session cho một structureId (single source —
 * khớp route khai báo trong src/App.jsx). Queue item chỉ cần `structureId`.
 * @param {string} structureId
 * @returns {string}
 */
export function structureSessionPath(structureId) {
  return `/structures/session/${structureId}`;
}

// ------------------------------------------------------------------
// RANDOM EXERCISE SELECTION (CHECKPOINT 8)
// Exercise KHÔNG phải SRS item — nó là ngân hàng bài tập dùng để kiểm tra
// Structure. Mỗi lần Structure đến lượt: chọn NGẪU NHIÊN ĐÚNG MỘT bài.
// Random thuần V1: không history, không recently-seen, không weighted,
// không difficulty/type balancing. Chọn trùng bài cũ KHÔNG phải bug.
// ------------------------------------------------------------------

/**
 * Chọn ngẫu nhiên đúng một exercise từ ngân hàng của Structure.
 *
 * @param {Array} exercises - ngân hàng exercise của MỘT structure (theo
 *                            structure_id). Có thể chứa NHIỀU exercise cùng
 *                            type — hoàn toàn hợp lệ.
 * @returns {object|null} một exercise bất kỳ, hoặc null khi bank rỗng /
 *                        input không phải mảng. KHÔNG mutate array gốc;
 *                        trả về REFERENCE của phần tử trong array.
 */
export function selectRandomStructureExercise(exercises) {
  const bank = Array.isArray(exercises) ? exercises : [];
  if (bank.length === 0) return null;
  const index = Math.floor(Math.random() * bank.length);
  return bank[index];
}

// ------------------------------------------------------------------
// ENCOUNTER MODE PLANNING (STRUCTURE LÀ MỘT KNOWLEDGE ITEM DUY NHẤT)
//
// Exercise KHÔNG phải knowledge item độc lập — nó là bài kiểm tra cho Structure.
// Cách phiên học dùng ngân hàng exercise phụ thuộc SRS state của Structure:
//
//   NEW    (chưa có user_structures hoặc state='new')
//          -> SEQUENCE: tối đa 6 bài ĐẦU TIÊN theo thứ tự ổn định, KHÔNG random;
//             rating Again/Hard/Good/Easy CHỈ xuất hiện sau bài cuối.
//   AGAIN  (state='learning' | 'relearning')
//          -> SEQUENCE (giống NEW): một lượt luyện lại đầy đủ rồi mới chấm lại.
//   REVIEW (state='review') -> RANDOM đúng 1 bài (giữ behavior CHECKPOINT 8):
//          - last_rating 2 (Hard) hoặc NULL (row cũ trước khi persist rating)
//            -> guided như hiện tại (reveal cấu trúc sau khi trả lời).
//          - last_rating 3 (Good) / 4 (Easy)
//            -> PURE TEST: UI KHÔNG render pattern/meaning/explanation.
//             (Trước khi trả lời thì mọi mode vốn đã trung tính — neutral recall.)
//
// Các số rating MIRROR RATING trong src/services/srs.service.js (3=Good, 4=Easy)
// — đặt tại đây thay vì import để util này giữ dependency-free (tránh vòng).
// ------------------------------------------------------------------

/** Số exercise tối đa một lượt SEQUENCE (AI generator tạo 6 bài / structure). */
export const STRUCTURE_SEQUENCE_LIMIT = 6;

/**
 * Trạng thái SRS buộc chạy đủ exercise-sequence trước khi được rating.
 * NEW + AGAIN -> true; các hàng đã tốt nghiệp (review) -> false.
 * @param {object|null} progress - row user_structures hoặc null (chưa học)
 */
export function isSequentialStructureProgress(progress) {
  const state = progress?.state || 'new';
  return state === 'new' || state === 'learning' || state === 'relearning';
}

/**
 * Sắp xếp exercise theo THỨ TỰ ỔN ĐỊNH (không random): created_at tăng dần,
 * tie-break bằng id tăng dần, cuối cùng giữ vị trí gốc nếu còn bằng nhau.
 *
 * getStructureExercises đã ORDER BY created_at ASC phía DB — lớp sort này là
 * phòng thủ thuần client để hai lần fetch cùng dữ liệu luôn ra cùng thứ tự
 * ("6 exercise đầu tiên theo thứ tự ổn định"), kể cả khi feed test thiếu meta.
 * KHÔNG mutate array gốc; trả về mảng mới gồm REFERENCES phần tử gốc.
 *
 * @param {Array} exercises
 * @returns {Array}
 */
export function orderStructureExercisesStable(exercises) {
  if (!Array.isArray(exercises)) return [];
  return exercises
    .map((item, index) => [item, index])
    .sort(([a, ai], [b, bi]) => {
      const ka = String(a?.created_at ?? '');
      const kb = String(b?.created_at ?? '');
      if (ka !== kb) return ka < kb ? -1 : 1;
      const idA = String(a?.id ?? '');
      const idB = String(b?.id ?? '');
      if (idA !== idB) return idA < idB ? -1 : 1;
      return ai - bi;
    })
    .map(([item]) => item);
}

/**
 * Xây kế hoạch gặp Structure trong phiên học dựa trên SRS state của nó.
 *
 * @param {object|null} progress - row user_structures của ĐÚNG structure này
 * @param {Array} exercises - NGÂN HÀNG exercise của ĐÚNG structure đó
 *                            (caller fetch theo structure_id — planner KHÔNG
 *                            merge/ngụy tạo dữ liệu nên isolation tự nhiên:
 *                            output luôn là tập con (theo reference) của input)
 * @returns {{ mode: 'sequence'|'random', exercises: Array, revealAfterAnswer: boolean }}
 *   - mode 'sequence': exercises = danh sách ổn định slice(0, 6); ít hơn 6 thì
 *     dùng số hiện có (KHÔNG duplicate để đủ số); nhiều hơn 6 lấy 6 đầu.
 *   - mode 'random': exercises = [MỘT bài random] (bank rỗng -> [] — caller xử
 *     lý skip / no-exercises như trước).
 *   - revealAfterAnswer=false => phiên là PURE TEST: feedback không reveal
 *     pattern/meaning/explanation (hint scaffold bị tắt).
 */
export function resolveStructureExercisePlan(progress, exercises) {
  const bank = Array.isArray(exercises) ? exercises.filter(Boolean) : [];

  // Bank rỗng: mode không còn ý nghĩa — để 'random' với exercises [] cho an toàn
  // (caller kiểm tra độ dài trước khi vào phase exercise).
  if (bank.length === 0) {
    return { mode: 'random', exercises: [], revealAfterAnswer: true };
  }

  // NEW / AGAIN — học/luyện lại đầy đủ qua sequence cố định trước khi chấm.
  if (isSequentialStructureProgress(progress)) {
    return {
      mode: 'sequence',
      exercises: orderStructureExercisesStable(bank).slice(0, STRUCTURE_SEQUENCE_LIMIT),
      revealAfterAnswer: true,
    };
  }

  // REVIEW — đã tốt nghiệp: random như hiện tại, chỉ khác mức gợi ý sau trả lời.
  const lastRating = Number(progress?.last_rating);
  const isPureTest = lastRating === 3 || lastRating === 4; // RATING.GOOD / RATING.EASY
  return {
    mode: 'random',
    exercises: [selectRandomStructureExercise(bank)].filter(Boolean),
    revealAfterAnswer: !isPureTest,
  };
}
