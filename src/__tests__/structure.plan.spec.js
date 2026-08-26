import { describe, it, expect, vi, afterEach } from 'vitest';

import {
  STRUCTURE_SEQUENCE_LIMIT,
  isSequentialStructureProgress,
  orderStructureExercisesStable,
  resolveStructureExercisePlan,
} from '../utils/structure-status.js';

// ------------------------------------------------------------------
// ENCOUNTER MODE PLANNING — Structure là MỘT knowledge item SRS; exercise
// chỉ là công cụ kiểm tra. Planner phải đáp ứng đúng quy tắc cốt lõi:
//
//   NEW   -> SEQUENCE ≤6 bài theo thứ tự ổn định (KHÔNG random)
//   AGAIN -> SEQUENCE (giống NEW)
//   HARD  (review + last_rating=2/null) -> RANDOM 1 bài, giữ behavior cũ
//   GOOD/EASY (review + last_rating=3/4) -> RANDOM 1 bài, PURE TEST (no hint)
//
// Edge cases: >6 bài, <6 bài, bank rỗng, thiếu created_at/id, isolation
// (output luôn tập con của input — không bao giờ trộn exercise structure khác).
// ------------------------------------------------------------------

afterEach(() => {
  vi.restoreAllMocks();
});

const T = (n) =>
  new Date(Date.parse('2026-01-01T00:00:00Z') + n * 60000).toISOString();

/** build một bank fill_blank với created_at tăng dần theo index */
function bank(n, prefix = 'fb') {
  return Array.from({ length: n }, (_, i) => ({
    id: `${prefix}-${i}`,
    type: 'fill_blank',
    question: `Q${prefix.toUpperCase()}-${i}?`,
    answer: `ans-${i}`,
    options: [],
    explanation: `expl ${i}`,
    created_at: T(i),
  }));
}

const DUE_PAST = '2026-01-01T00:00:00Z';

describe('resolveStructureExercisePlan — NEW (SEQUENCE, không random)', () => {
  it('N1. progress null (chưa học) -> mode sequence, đủ 6, đúng thứ tự created_at', () => {
    // Trộn lộn xộn input: planner phải tự sắp lại theo created_at ASC.
    const b = [
      { id: 'e5', question: 'Q5?', created_at: T(50), type: 'fill_blank', answer: 'x' },
      { id: 'e1', question: 'Q1?', created_at: T(10), type: 'fill_blank', answer: 'x' },
      { id: 'e3', question: 'Q3?', created_at: T(30), type: 'fill_blank', answer: 'x' },
      { id: 'e6', question: 'Q6?', created_at: T(60), type: 'fill_blank', answer: 'x' },
      { id: 'e2', question: 'Q2?', created_at: T(20), type: 'fill_blank', answer: 'x' },
      { id: 'e4', question: 'Q4?', created_at: T(40), type: 'fill_blank', answer: 'x' },
    ];
    const plan = resolveStructureExercisePlan(null, b);
    expect(plan.mode).toBe('sequence');
    expect(plan.exercises).toHaveLength(6);
    expect(plan.revealAfterAnswer).toBe(true);
    // Thứ tự ổn định: 1→2→3→4→5→6 bất kể thứ tự mảng gốc.
    expect(plan.exercises.map((e) => e.id)).toEqual(['e1', 'e2', 'e3', 'e4', 'e5', 'e6']);
  });

  it('N2. KHÔNG random: pin Math.random về 0 cũng không đổi danh sách output', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0);
    const b = bank(6, 'nrd');
    const plan = resolveStructureExercisePlan(null, b);
    expect(plan.mode).toBe('sequence');
    // Nếu planner vô tình dùng random thì Math.random()=0 chỉ trả lại phần tử
    // đầu — chứng minh bằng so khớp ĐẦY ĐỦ cả 6 phần tử theo thứ tự ổn định.
    expect(plan.exercises.map((e) => e.id)).toEqual(b.map((e) => e.id));
    expect(spy).not.toHaveBeenCalled();
  });

  it('N3. state="new" tường minh -> vẫn SEQUENCE', () => {
    const plan = resolveStructureExercisePlan(
      { state: 'new', learning_step: 0 },
      bank(3, 'nw')
    );
    expect(plan.mode).toBe('sequence');
    expect(plan.exercises).toHaveLength(3);
  });
});

describe('resolveStructureExercisePlan — AGAIN (SEQUENCE giống NEW)', () => {
  it.each([['learning'], ['relearning']])(
    'A1-%s: lại chạy sequence ≤6 bài, đúng thứ tự, không random',
    (state) => {
      const spy = vi.spyOn(Math, 'random').mockReturnValue(0);
      const b = [
        { id: 'l2', question: 'L2?', created_at: T(20), type: 'fill_blank', answer: 'x' },
        { id: 'l1', question: 'L1?', created_at: T(10), type: 'fill_blank', answer: 'x' },
      ];
      const plan = resolveStructureExercisePlan({ state, learning_step: 0 }, b);
      expect(plan.mode).toBe('sequence');
      expect(plan.exercises.map((e) => e.id)).toEqual(['l1', 'l2']); // sort theo created_at
      expect(plan.revealAfterAnswer).toBe(true); // guided: được dạy lại khi luyện
      expect(spy).not.toHaveBeenCalled();
    }
  );

  it('A2. AGAIN với >6 bài -> chỉ lấy 6 đầu theo thứ tự ổn định', () => {
    const b = bank(9, 'agn');
    const plan = resolveStructureExercisePlan({ state: 'learning' }, b);
    expect(plan.mode).toBe('sequence');
    expect(plan.exercises).toHaveLength(STRUCTURE_SEQUENCE_LIMIT);
    expect(plan.exercises.map((e) => e.id)).toEqual(b.slice(0, 6).map((e) => e.id));
  });
});

describe('resolveStructureExercisePlan — HARD (random practice, giữ behavior)', () => {
  it('H1. review + last_rating=2 -> RANDOM đúng 1 bài, có reveal (guided)', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.25);
    const b = bank(4, 'hrd');
    const plan = resolveStructureExercisePlan(
      { state: 'review', review_due_at: DUE_PAST, last_rating: 2 },
      b
    );
    expect(plan.mode).toBe('random');
    expect(plan.exercises).toHaveLength(1); // KHÔNG ép sequence 6 bài
    expect(plan.exercises[0]).toBe(b[Math.floor(0.25 * 4)]);
    expect(plan.revealAfterAnswer).toBe(true); // behavior hiện tại được giữ nguyên
  });

  it('H2. review LEGACY (không có last_rating) -> giữ behavior cũ: random + guided', () => {
    const plan = resolveStructureExercisePlan(
      { state: 'review', review_due_at: DUE_PAST },
      bank(3, 'lgc')
    );
    expect(plan.mode).toBe('random');
    expect(plan.revealAfterAnswer).toBe(true);
  });
});

describe('resolveStructureExercisePlan — GOOD/EASY (PURE TEST)', () => {
  it.each([
    ['GOOD', 3],
    ['EASY', 4],
  ])('%s (last_rating=%s) -> RANDOM 1 bài và KHÔNG hint/scaffold', (_, rating) => {
    const plan = resolveStructureExercisePlan(
      { state: 'review', review_due_at: DUE_PAST, last_rating: rating },
      bank(6, 'gz')
    );
    expect(plan.mode).toBe('random');
    expect(plan.exercises).toHaveLength(1);
    expect(plan.revealAfterAnswer).toBe(false); // feedback sẽ không render pattern
  });
});

describe('resolveStructureExercisePlan — EDGE CASES', () => {
  it('E1. bank rỗng / sai kiểu -> exercises [], mode random, không crash', () => {
    for (const bad of [[], null, undefined, {}, 'not-array']) {
      const plan = resolveStructureExercisePlan(null, bad);
      expect(plan.mode).toBe('random');
      expect(plan.exercises).toEqual([]);
      expect(plan.revealAfterAnswer).toBe(true);
    }
  });

  it('E2. ít hơn 6 bài -> dùng số hiện có, KHÔNG duplicate để đủ 6', () => {
    const b = bank(3, 'few');
    const plan = resolveStructureExercisePlan(null, b);
    expect(plan.exercises).toHaveLength(3);
    expect(new Set(plan.exercises.map((e) => e.id)).size).toBe(3);
  });

  it('E3. hơn 6 bài -> ĐÚNG 6 đầu tiên, không dư', () => {
    const b = bank(11, 'many');
    const plan = resolveStructureExercisePlan(null, b);
    expect(plan.exercises).toHaveLength(6);
    expect(plan.exercises.map((e) => e.id)).toEqual([
      'many-0',
      'many-1',
      'many-2',
      'many-3',
      'many-4',
      'many-5',
    ]);
  });

  it('E4. ISOLATION: mọi exercise trong kế hoạch là REFERENCE nằm trong input', () => {
    const mineOnly = bank(5, 'mine');
    // Nếu planner lỡ merge/ngụy tạo dữ liệu ngoài input thì inclusion fail.
    for (const progress of [
      null,
      { state: 'learning' },
      { state: 'review', last_rating: 3 },
    ]) {
      const plan = resolveStructureExercisePlan(progress, mineOnly);
      for (const ex of plan.exercises) {
        expect(mineOnly.includes(ex)).toBe(true);
      }
    }
  });

  it('E5. KHÔNG mutate ngân hàng gốc', () => {
    const b = bank(6, 'mm');
    const snapshot = [...b];
    resolveStructureExercisePlan(null, b);
    resolveStructureExercisePlan({ state: 'review', last_rating: 3 }, b);
    expect(b).toEqual(snapshot);
    expect(b).toHaveLength(6);
  });

  it('E6. entry null/undefined trong bank bị loại an toàn', () => {
    const b = [...bank(2, 'nz'), null, undefined];
    const plan = resolveStructureExercisePlan(null, b);
    expect(plan.exercises.map((e) => e.id)).toEqual(['nz-0', 'nz-1']);
  });
});

describe('orderStructureExercisesStable', () => {
  it('O1. sort ổn định theo created_at rồi id, thiếu field vẫn ổn', () => {
    const raw = [
      { id: 'b', created_at: T(2) },
      { id: 'a', created_at: T(1) },
      { id: 'd' }, // không created_at -> như chuỗi rỗng '', đứng TRƯỚC mọi giá trị
      { id: 'c', created_at: T(2) }, // tie với 'b' -> tie-break id
    ];
    const sorted = orderStructureExercisesStable(raw);
    expect(sorted.map((e) => e.id)).toEqual(['d', 'a', 'b', 'c']);
    // Reference-preserving + non-mutating:
    expect(sorted.every((item) => raw.includes(item))).toBe(true);
    expect(raw.map((e) => e.id)).toEqual(['b', 'a', 'd', 'c']);
  });

  it('O2. không phải mảng -> []', () => {
    expect(orderStructureExercisesStable(null)).toEqual([]);
    expect(orderStructureExercisesStable('x')).toEqual([]);
  });
});

describe('isSequentialStructureProgress — ranh giới bucket', () => {
  it('S1. new/missing/learning/relearning -> TRUE; còn lại -> FALSE', () => {
    expect(isSequentialStructureProgress(null)).toBe(true);
    expect(isSequentialStructureProgress(undefined)).toBe(true);
    expect(isSequentialStructureProgress({})).toBe(true);
    expect(isSequentialStructureProgress({ state: 'new' })).toBe(true);
    expect(isSequentialStructureProgress({ state: 'learning' })).toBe(true);
    expect(isSequentialStructureProgress({ state: 'relearning' })).toBe(true);
    expect(isSequentialStructureProgress({ state: 'review' })).toBe(false);
    expect(isSequentialStructureProgress({ state: 'weird' })).toBe(false); // phòng thủ
  });
});
