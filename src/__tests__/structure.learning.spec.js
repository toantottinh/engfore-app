import { describe, it, expect, vi, beforeEach } from 'vitest';

// ------------------------------------------------------------------
// CHECKPOINT 5+6 — Structure Learning Queue + SRS reuse + Record.
//
// Chứng minh:
//   1. Queue DUE → LEARNING → NEW (review chưa tới hạn bị loại).
//   2. SRS behavior của Structure GIỐNG HỆT Vocabulary vì dùng đúng
//      computeSrsPayload (không scheduler mới).
//   3. Interval preview lấy từ computeSrsPayload (không hardcode).
//   4. recordStructureResult upsert ĐÚNG user_structures(user_id, structure_id).
// ------------------------------------------------------------------

// ---- Supabase mock (chainable builder + thenable cho queue queries) ----
export const dbState = {
  structures: [],
  userStructures: [],
  exercises: [],
  upsertError: null,
  lastEq: null,
};
const upsertCalls = [];

function tableMock(name) {
  const rows = () =>
    name === 'structures'
      ? dbState.structures
      : name === 'structure_exercises'
      ? dbState.exercises
      : dbState.userStructures;
  const api = {};
  api._upserted = false;
  api.select = vi.fn(() => api);
  api.eq = vi.fn((col, val) => {
    dbState.lastEq = { col, val };
    return api;
  });
  api.lte = vi.fn(() => api);
  api.gt = vi.fn(() => api);
  api.order = vi.fn(() => api);
  api.limit = vi.fn(() => api);
  api.upsert = vi.fn((payload, opts) => {
    upsertCalls.push({ payload, opts });
    api._upserted = true;
    return api;
  });
  api.maybeSingle = vi.fn(async () => {
    if (api._upserted) {
      const last = upsertCalls[upsertCalls.length - 1];
      return dbState.upsertError
        ? { data: null, error: dbState.upsertError }
        : { data: last.payload, error: null };
    }
    return { data: rows()[0] ?? null, error: null };
  });
  // Cho phép `await builder` (dùng bởi getStructureSessionQueue).
  api.then = (onFulfilled, onRejected) =>
    Promise.resolve({ data: rows(), error: null }).then(onFulfilled, onRejected);
  return api;
}

vi.mock('../services/supabase.js', () => ({
  supabase: {
    from: (name) => tableMock(name),
  },
}));

import { buildStructureSessionQueue, structureQueueBucket } from '../utils/structure-status.js';
import { getStructureSessionQueue, recordStructureResult } from '../services/structure-learning.service.js';
import { getStructureExercises } from '../services/structure.service.js';
import { computeSrsPayload, RATING } from '../services/srs.service.js';
import { RATING_MAP } from '../hooks/useStructureSession.js';

const NOW_PLUS = (hours) => new Date(Date.now() + hours * 3600 * 1000).toISOString();
const NOW_MINUS = (hours) => new Date(Date.now() - hours * 3600 * 1000).toISOString();

describe('buildStructureSessionQueue — thứ tự DUE → LEARNING → NEW', () => {
  const structures = [
    { id: 'new1', created_at: '2026-01-03', pattern: 'New A' },
    { id: 'due1', created_at: '2026-01-01', pattern: 'Due A' },
    { id: 'learn1', created_at: '2026-01-02', pattern: 'Learn A' },
    { id: 'future-review', created_at: '2026-01-04', pattern: 'Future Review' },
    { id: 'no-progress', created_at: '2026-01-05', pattern: 'Brand New' },
  ];
  const progressMap = {
    due1: { state: 'review', review_due_at: NOW_MINUS(2) },   // quá hạn
    learn1: { state: 'learning', review_due_at: NOW_PLUS(1) },
    'future-review': { state: 'review', review_due_at: NOW_PLUS(48) }, // chưa tới hạn
  };

  it('do first, learning second, new last', () => {
    const q = buildStructureSessionQueue(structures, progressMap);
    expect(q.map((s) => s.id)).toEqual(['due1', 'learn1', 'new1', 'no-progress']);
  });

  it('review CHƯA tới hạn bị LOẠI khỏi queue', () => {
    const q = buildStructureSessionQueue(structures, progressMap);
    expect(q.some((s) => s.id === 'future-review')).toBe(false);
  });

  it('structure KHÔNG có user_structures được coi là NEW và vào queue', () => {
    const q = buildStructureSessionQueue([{ id: 'x', created_at: '2026-02-01' }], {});
    expect(q).toHaveLength(1);
    expect(q[0].id).toBe('x');
    expect(q[0].user_structures).toBeNull();
  });

  it('queue rỗng khi không có gì', () => {
    expect(buildStructureSessionQueue([], {})).toEqual([]);
  });

  it('DUE sort theo review_due_at tăng dần (quá hạn lâu nhất trước)', () => {
    const s = [{ id: 'a' }, { id: 'b' }];
    const pm = {
      a: { state: 'review', review_due_at: NOW_MINUS(1) },
      b: { state: 'review', review_due_at: NOW_MINUS(10) },
    };
    const q = buildStructureSessionQueue(s, pm);
    expect(q.map((x) => x.id)).toEqual(['b', 'a']);
  });

  it('structureQueueBucket phân loại đúng', () => {
    expect(structureQueueBucket(null)).toBe('new');
    expect(structureQueueBucket({ state: 'new' })).toBe('new');
    expect(structureQueueBucket({ state: 'learning' })).toBe('learning');
    expect(structureQueueBucket({ state: 'relearning' })).toBe('learning');
    expect(structureQueueBucket({ state: 'review', review_due_at: NOW_MINUS(1) })).toBe('due');
    expect(structureQueueBucket({ state: 'review', review_due_at: NOW_PLUS(5) })).toBe('review-future');
  });
});

describe('getStructureSessionQueue — service (mocked DB)', () => {
  beforeEach(() => {
    dbState.structures = [];
    dbState.userStructures = [];
    dbState.upsertError = null;
    upsertCalls.length = 0;
  });

  it('trả queue đúng thứ tự từ DB mock', async () => {
    dbState.structures = [
      { id: 'n1', created_at: '2026-01-03', pattern: 'N' },
      { id: 'd1', created_at: '2026-01-01', pattern: 'D' },
      { id: 'l1', created_at: '2026-01-02', pattern: 'L' },
    ];
    dbState.userStructures = [
      { structure_id: 'l1', state: 'learning', review_due_at: NOW_PLUS(1) },
      { structure_id: 'd1', state: 'review', review_due_at: NOW_MINUS(1) },
    ];
    const { data, error } = await getStructureSessionQueue('u1');
    expect(error).toBeNull();
    expect(data.map((s) => s.id)).toEqual(['d1', 'l1', 'n1']);
  });

  it('thiếu userId -> lỗi', async () => {
    const { error } = await getStructureSessionQueue('');
    expect(error?.message).toMatch(/Thiếu userId/);
  });
});

// ------------------------------------------------------------------
// SRS — chứng minh Structure dùng ĐÚNG scheduler của Vocabulary.
// Behavior tham chiếu: LEARNING_STEPS [10m,60m,240m], graduate Hard 24h /
// Good 72h / Easy 168h; review AGAIN -> relearning 10m + lapses+1.
// ------------------------------------------------------------------

describe('SRS reuse — computeSrsPayload cho NEW structure (giống Vocabulary)', () => {
  it('NEW + AGAIN -> learning, step 0, due ~10 phút', () => {
    const { progress } = computeSrsPayload({ state: 'new', learning_step: 0 }, RATING.AGAIN);
    expect(progress.state).toBe('learning');
    expect(progress.learning_step).toBe(0);
    const mins = (Date.parse(progress.review_due_at) - Date.now()) / 60000;
    expect(mins).toBeGreaterThan(8);
    expect(mins).toBeLessThan(12);
  });

  it('NEW + HARD ở step 0 -> giữ step 0 (Hard lặp bước hiện tại)', () => {
    const { progress } = computeSrsPayload({ state: 'new', learning_step: 0 }, RATING.HARD);
    expect(progress.state).toBe('learning');
    expect(progress.learning_step).toBe(0);
  });

  it('NEW + GOOD -> tiến 1 step (0->1)', () => {
    const { progress } = computeSrsPayload({ state: 'new', learning_step: 0 }, RATING.GOOD);
    expect(progress.learning_step).toBe(1);
    expect(progress.state).toBe('learning');
  });

  it('NEW + EASY -> tiến 2 step (0->2)', () => {
    const { progress } = computeSrsPayload({ state: 'new', learning_step: 0 }, RATING.EASY);
    expect(progress.learning_step).toBe(2);
    expect(progress.state).toBe('learning');
  });

  it('NEW + GOOD ở step cuối -> graduate review với interval 72h', () => {
    const { progress } = computeSrsPayload({ state: 'new', learning_step: 2 }, RATING.GOOD);
    expect(progress.state).toBe('review');
    expect(progress.repetitions).toBe(1);
    expect(progress.interval_hours).toBe(72);
  });
});

describe('SRS reuse — REVIEW structure', () => {
  it('REVIEW + AGAIN -> relearning + lapses+1', () => {
    const prog = { state: 'review', repetitions: 3, lapses: 1, ease_factor: 2.5 };
    const { progress } = computeSrsPayload(prog, RATING.AGAIN);
    expect(progress.state).toBe('relearning');
    expect(progress.lapses).toBe(2);
    expect(progress.repetitions).toBe(0);
  });

  it('REVIEW + GOOD -> nhân interval theo ease, repetitions+1, giữ review', () => {
    const prog = { state: 'review', repetitions: 2, interval_hours: 72, ease_factor: 2.5 };
    const { progress } = computeSrsPayload(prog, RATING.GOOD);
    expect(progress.state).toBe('review');
    expect(progress.interval_hours).toBe(Math.round(72 * 2.5));
    expect(progress.repetitions).toBe(3);
  });

  it('REVIEW + HARD giảm interval so với GOOD; EASY tăng', () => {
    const base = { state: 'review', repetitions: 2, interval_hours: 72, ease_factor: 2.5 };
    const hard = computeSrsPayload(base, RATING.HARD).progress;
    const good = computeSrsPayload(base, RATING.GOOD).progress;
    const easy = computeSrsPayload(base, RATING.EASY).progress;
    expect(hard.interval_hours).toBeLessThan(good.interval_hours);
    expect(easy.interval_hours).toBeGreaterThan(good.interval_hours);
  });
});

describe('INTERVAL preview — dùng computeSrsPayload, KHÔNG hardcode', () => {
  it('RATING_MAP khớp enum RATING của srs.service', () => {
    expect(RATING_MAP.again).toBe(RATING.AGAIN);
    expect(RATING_MAP.hard).toBe(RATING.HARD);
    expect(RATING_MAP.good).toBe(RATING.GOOD);
    expect(RATING_MAP.easy).toBe(RATING.EASY);
  });

  it('preview NEW card: again ~10m, hard ~10m, good ~60m, easy ~240m (theo learning steps)', () => {
    const previews = {};
    for (const key of ['again', 'hard', 'good', 'easy']) {
      const { progress } = computeSrsPayload(
        { state: 'new', learning_step: 0 },
        RATING_MAP[key],
        {}
      );
      previews[key] = progress.review_due_at;
    }
    const approxMin = (iso) => (Date.parse(iso) - Date.now()) / 60000;
    expect(approxMin(previews.again)).toBeGreaterThan(8);   // ~10m
    expect(approxMin(previews.hard)).toBeGreaterThan(8);    // Hard giữ step -> ~10m
    expect(approxMin(previews.good)).toBeGreaterThan(55);   // ~60m
    expect(approxMin(previews.easy)).toBeGreaterThan(230);  // ~240m
  });
});

describe('recordStructureResult — upsert user_structures', () => {
  beforeEach(() => {
    dbState.structures = [];
    dbState.userStructures = [];
    dbState.upsertError = null;
    upsertCalls.length = 0;
  });

  it('lần đầu rating GOOD (chưa có row) -> tạo user_structures đúng keys', async () => {
    const { progress, error } = await recordStructureResult({
      userId: 'u1',
      structureId: 's1',
      rating: RATING_MAP.good,
    });
    expect(error).toBeNull();
    expect(upsertCalls).toHaveLength(1);
    const { payload, opts } = upsertCalls[0];
    expect(opts.onConflict).toBe('user_id,structure_id');
    expect(payload.user_id).toBe('u1');
    expect(payload.structure_id).toBe('s1');
    // NEW + GOOD(step 0) -> learning step 1
    expect(payload.state).toBe('learning');
    expect(payload.learning_step).toBe(1);
    expect(payload.review_count).toBe(1);
    expect(payload.mastery_level).toBe(1); // correct -> +1
    expect(typeof payload.review_due_at).toBe('string');
    expect(typeof payload.last_reviewed_at).toBe('string');
    expect(progress.structure_id).toBe('s1');
  });

  it('rating AGAIN trên REVIEW -> relearning, lapses+1, mastery -1', async () => {
    dbState.userStructures = [
      {
        user_id: 'u1',
        structure_id: 's2',
        state: 'review',
        mastery_level: 3,
        review_count: 5,
        lapses: 0,
        ease_factor: 2.5,
        repetitions: 2,
        interval_hours: 72,
        learning_step: 0,
      },
    ];
    const { error } = await recordStructureResult({
      userId: 'u1',
      structureId: 's2',
      rating: RATING_MAP.again,
    });
    expect(error).toBeNull();
    const { payload } = upsertCalls[0];
    expect(payload.state).toBe('relearning');
    expect(payload.lapses).toBe(1);
    expect(payload.mastery_level).toBe(2); // incorrect -> -1
    expect(payload.review_count).toBe(6);
    expect(payload.user_id).toBe('u1');
    expect(payload.structure_id).toBe('s2');
  });

  it('thiếu params -> lỗi, không gọi upsert', async () => {
    await recordStructureResult({ userId: '', structureId: 's1', rating: 3 });
    expect(upsertCalls).toHaveLength(0);
  });
});

// ------------------------------------------------------------------
// INVARIANTS (Exercise ↔ Knowledge ↔ SRS):
//   1. Mỗi exercise gắn ĐÚNG structure qua structure_id ổn định
//      (runtime query theo uuid, KHÔNG match pattern text).
//   2. N exercises của CÙNG structure -> CÙNG MỘT thẻ SRS
//      (upsert trùng PK user_id+structure_id; payload KHÔNG có exercise_id).
// ------------------------------------------------------------------

describe('Exercise → Structure linkage (runtime scoping theo structure_id)', () => {
  beforeEach(() => {
    dbState.structures = [];
    dbState.userStructures = [];
    dbState.exercises = [];
    dbState.upsertError = null;
    dbState.lastEq = null;
    upsertCalls.length = 0;
  });

  it('getStructureExercises query theo structure_id (uuid), KHÔNG theo pattern', async () => {
    dbState.exercises = [
      { id: 'x1', structure_id: 's1', type: 'multiple_choice', question: 'Q?', answer: 'A', options: ['A', 'B'], explanation: null },
      { id: 'x2', structure_id: 's1', type: 'fill_blank', question: 'I ___ English.', answer: 'study', options: [], explanation: null },
    ];
    const { data, error } = await getStructureExercises('s1');
    expect(error).toBeNull();
    // Query scope bằng stable ID:
    expect(dbState.lastEq).toEqual({ col: 'structure_id', val: 's1' });
    // Mọi row trả về đều mang đúng structure_id đó:
    expect(data).toHaveLength(2);
    expect(data.every((e) => e.structure_id === 's1')).toBe(true);
  });

  it('options JSONB không phải mảng -> chuẩn hóa về [] (an toàn render)', async () => {
    dbState.exercises = [
      { id: 'x3', structure_id: 's1', type: 'translation', question: 'Q', answer: 'A', options: null, explanation: null },
    ];
    const { data } = await getStructureExercises('s1');
    expect(data[0].options).toEqual([]);
  });
});

describe('ONE SRS state per user+structure — N exercises KHÔNG tạo N thẻ', () => {
  beforeEach(() => {
    dbState.structures = [];
    dbState.userStructures = [];
    dbState.exercises = [];
    dbState.upsertError = null;
    dbState.lastEq = null;
    upsertCalls.length = 0;
  });

  it('hai exercise khác nhau của cùng structure -> upsert cùng MỘT PK, payload không có exercise_id', async () => {
    // Hai exercise thuộc cùng Structure Knowledge "I want to + V" — hook load
    // cả hai theo structureId 's1' và sau exercise set gọi rating cho s1.
    await recordStructureResult({ userId: 'u1', structureId: 's1', rating: RATING_MAP.good }); // sau exercise 1
    // Giả lập row đã persist sau lần 1 để lần 2 đọc existing (cùng thẻ).
    dbState.userStructures = [upsertCalls[0].payload];
    await recordStructureResult({ userId: 'u1', structureId: 's1', rating: RATING_MAP.good }); // sau exercise 2

    expect(upsertCalls).toHaveLength(2);
    for (const { payload, opts } of upsertCalls) {
      expect(opts.onConflict).toBe('user_id,structure_id'); // đúng MỘT thẻ logic
      expect(payload.user_id).toBe('u1');
      expect(payload.structure_id).toBe('s1');
      // KHÔNG bao giờ có per-exercise SRS card:
      expect(payload).not.toHaveProperty('exercise_id');
    }

    // Cùng thẻ tiến bộ liên tục: review_count cộng dồn 1 -> 2 (không reset).
    expect(upsertCalls[0].payload.review_count).toBe(1);
    expect(upsertCalls[1].payload.review_count).toBe(2);
    expect(upsertCalls[1].payload.learning_step).toBe(2); // GOOD step1 -> step2 trên CÙNG thẻ
  });

  it('SRS payload chỉ chứa đúng bộ field cố định (mirror user_progress)', () => {
    const EXPECTED_KEYS = [
      'ease_factor',
      'interval_hours',
      'last_reviewed_at',
      'learning_step',
      'lapses',
      'mastery_level',
      'review_count',
      'review_due_at',
      'repetitions',
      'state',
      'structure_id',
      'user_id',
    ].sort();
    return recordStructureResult({ userId: 'u1', structureId: 's1', rating: RATING_MAP.good }).then(
      () => {
        expect(Object.keys(upsertCalls[0].payload).sort()).toEqual(EXPECTED_KEYS);
      }
    );
  });
});