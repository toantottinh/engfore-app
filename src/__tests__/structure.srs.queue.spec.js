import { describe, it, expect, vi, beforeEach } from 'vitest';

// ------------------------------------------------------------------
// CHECKPOINT 7 — STRUCTURE SRS QUEUE trong /learn (service + pure level)
//
//   A. NEW detection       — chưa có user_structures => NEW
//   B. DUE detection       — state='review' && review_due_at<=now => DUE
//   C. LEARNING detection  — state learning/relearning => LEARNING
//   D. Queue ordering      — DUE → LEARNING → NEW (NEW không chen trước DUE)
//   E. Stable ID           — item.structureId (UUID), KHÔNG phải pattern
//   G. SRS update          — recordStructureResult đúng user_id/structure_id/
//                            rating (mirror scheduler Vocabulary)
//   H. No duplicate SRS    — nhiều session của cùng structure vẫn ĐÚNG MỘT
//                            thẻ theo PK (user_id, structure_id)
//
// Chạy REAL service nhưng trỏ data layer vào supabase mock cục bộ —
// giống learning.queue.spec.js / structure.learning.spec.js.
// ------------------------------------------------------------------

export const dbState = {
  structures: [],
  userStructures: [],
  upsertError: null,
  lastEq: null,
};
const upsertCalls = [];

function tableMock(name) {
  const rows = () =>
    name === 'structures' ? dbState.structures : dbState.userStructures;
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
    // Đọc existing (recordStructureResult) -> row đầu tiên hoặc null.
    return { data: rows()[0] ?? null, error: null };
  });
  // Cho phép `await builder` (dùng bởi getStructureSessionQueue).
  api.then = (onFulfilled, onRejected) =>
    Promise.resolve({ data: rows(), error: null }).then(onFulfilled, onRejected);
  return api;
}

vi.mock('../services/supabase.js', () => ({
  supabase: { from: (name) => tableMock(name) },
}));

import {
  structureQueueBucket,
  buildStructureSessionQueue,
  partitionStructureQueue,
  structureSessionPath,
} from '../utils/structure-status.js';
import {
  getStructureSessionQueue,
  recordStructureResult,
} from '../services/structure-learning.service.js';
import { RATING } from '../services/srs.service.js';

const NOW_PLUS = (hours) => new Date(Date.now() + hours * 3600 * 1000).toISOString();
const NOW_MINUS = (hours) => new Date(Date.now() - hours * 3600 * 1000).toISOString();

describe('A/B/C — NEW / DUE / LEARNING detection (user_structures)', () => {
  it('A. Structure CHƯA có user_structures -> NEW (không cần row)', () => {
    expect(structureQueueBucket(null)).toBe('new');
    expect(structureQueueBucket(undefined)).toBe('new');
    expect(structureQueueBucket({})).toBe('new');
  });

  it('A2. state="new" (có row nhưng chưa học xong step) vẫn là NEW', () => {
    expect(structureQueueBucket({ state: 'new' })).toBe('new');
  });

  it('B. state="review" + review_due_at <= now -> DUE', () => {
    expect(
      structureQueueBucket({ state: 'review', review_due_at: NOW_MINUS(1) })
    ).toBe('due');
    // Đến hạn đúng ranh giới (== now) cũng tính là DUE.
    expect(
      structureQueueBucket({ state: 'review', review_due_at: new Date().toISOString() })
    ).toBe('due');
  });

  it("B2. state='review' nhưng CHƯA tới hạn -> review-future (LOẠI khỏi queue)", () => {
    expect(
      structureQueueBucket({ state: 'review', review_due_at: NOW_PLUS(48) })
    ).toBe('review-future');
  });

  it("C. state='learning' và 'relearning' -> LEARNING", () => {
    expect(structureQueueBucket({ state: 'learning' })).toBe('learning');
    expect(structureQueueBucket({ state: 'relearning' })).toBe('learning');
  });
});

describe('D/E — Queue ordering + stable structureId', () => {
  // Structure A = DUE, B = LEARNING, C/D = NEW (C created TRƯỚC cả A nhưng
  // vẫn KHÔNG được chen trước DUE/LEARNING).
  const structures = [
    { id: 'id-new-c', pattern: 'Pattern C (new)', created_at: '2026-01-01' },
    { id: 'id-due-a', pattern: 'Pattern A (due)', created_at: '2026-01-04' },
    { id: 'id-new-d', pattern: 'Pattern D (new)', created_at: '2026-01-02' },
    { id: 'id-learn-b', pattern: 'Pattern B (learning)', created_at: '2026-01-03' },
    { id: 'id-future', pattern: 'Pattern Future', created_at: '2026-01-05' },
  ];
  const progressMap = {
    'id-due-a': { state: 'review', review_due_at: NOW_MINUS(3) },
    'id-learn-b': { state: 'learning', learning_step: 1, review_due_at: NOW_PLUS(1) },
    'id-future': { state: 'review', review_due_at: NOW_PLUS(72) },
  };

  it('D. Thứ tự queue: DUE -> LEARNING -> NEW; review-future bị loại', () => {
    const q = buildStructureSessionQueue(structures, progressMap);
    expect(q.map((s) => s.id)).toEqual([
      'id-due-a',
      'id-learn-b',
      'id-new-c',
      'id-new-d',
    ]);
  });

  it('D2. getStructureSessionQueue (service thật + supabase mock) cùng thứ tự', async () => {
    dbState.structures = structures;
    dbState.userStructures = [
      { structure_id: 'id-due-a', state: 'review', review_due_at: NOW_MINUS(3) },
      { structure_id: 'id-learn-b', state: 'learning', learning_step: 1, review_due_at: NOW_PLUS(1) },
      { structure_id: 'id-future', state: 'review', review_due_at: NOW_PLUS(72) },
    ];
    const { data, error } = await getStructureSessionQueue('user-1');
    expect(error).toBeNull();
    expect(data.map((s) => s.id)).toEqual([
      'id-due-a',
      'id-learn-b',
      'id-new-c',
      'id-new-d',
    ]);
    // Load queue chỉ ĐỌC — không tạo row user_structures cho structure NEW.
    expect(upsertCalls).toHaveLength(0);
  });

  it('E. Mỗi item mang structureId (stable UUID) — pattern chỉ để hiển thị', () => {
    const q = buildStructureSessionQueue(structures, progressMap);
    for (const item of q) {
      expect(item.structureId).toBe(item.id);
      // Identity KHÔNG bao giờ là pattern text.
      expect(item.structureId).not.toBe(item.pattern);
      expect(structureSessionPath(item.structureId)).toBe(
        `/structures/session/${item.id}`
      );
    }
  });

  it('D3. partitionStructureQueue chia đúng 3 nhóm cho UI /learn', () => {
    const q = buildStructureSessionQueue(structures, progressMap);
    const sections = partitionStructureQueue(q);
    expect(sections.due.map((s) => s.id)).toEqual(['id-due-a']);
    expect(sections.learning.map((s) => s.id)).toEqual(['id-learn-b']);
    expect(sections.new.map((s) => s.id)).toEqual(['id-new-c', 'id-new-d']);
  });
});

describe('G/H — recordStructureResult: SRS update + ONE row per user+structure', () => {
  beforeEach(() => {
    dbState.structures = [];
    dbState.userStructures = [];
    dbState.upsertError = null;
    dbState.lastEq = null;
    upsertCalls.length = 0;
  });

  it('G. rating GOOD lần đầu -> upsert ĐÚNG user_id + structure_id, mastery +1', async () => {
    const { progress, error } = await recordStructureResult({
      userId: 'u1',
      structureId: 's-due',
      rating: RATING.GOOD,
    });
    expect(error).toBeNull();
    expect(upsertCalls).toHaveLength(1);
    const { payload, opts } = upsertCalls[0];
    expect(opts.onConflict).toBe('user_id,structure_id'); // đúng MỘT thẻ logic
    expect(payload.user_id).toBe('u1');
    expect(payload.structure_id).toBe('s-due');
    // Rating GOOD (>= HARD) = correct -> mirror rule Vocabulary: mastery +1.
    expect(progress.mastery_level).toBe(1);
    expect(payload.mastery_level).toBe(1);
    // NEW -> learning step 1 sau GOOD (computeSrsPayload, không scheduler mới).
    expect(payload.state).toBe('learning');
    expect(payload.learning_step).toBe(1);
    // KHÔNG bao giờ có per-exercise card.
    expect(payload).not.toHaveProperty('exercise_id');
  });

  it("G2. rating AGAIN trên structure có sẵn mastery 3 -> mastery -1 (mirror Vocabulary)", async () => {
    dbState.userStructures = [
      {
        user_id: 'u1',
        structure_id: 's2',
        state: 'review',
        mastery_level: 3,
        review_count: 5,
        ease_factor: 2.5,
        repetitions: 3,
        interval_hours: 72,
        lapses: 0,
        learning_step: 0,
        review_due_at: NOW_MINUS(2),
      },
    ];
    await recordStructureResult({ userId: 'u1', structureId: 's2', rating: RATING.AGAIN });
    const { payload } = upsertCalls[0];
    expect(payload.mastery_level).toBe(2); // 3 - 1
    expect(payload.review_count).toBe(6); // +1 mỗi lượt
    expect(payload.state).toBe('relearning'); // AGAIN trong review -> lapse
    expect(payload.lapses).toBe(1);
    expect(payload.user_id).toBe('u1');
    expect(payload.structure_id).toBe('s2');
  });

  it('H. Ba session liên tiếp cùng (user, structure) -> vẫn MỘT thẻ, review_count cộng dồn', async () => {
    for (let i = 0; i < 3; i += 1) {
      const { error } = await recordStructureResult({
        userId: 'u9',
        structureId: 's-same',
        rating: RATING.GOOD,
      });
      expect(error).toBeNull();
      // Giả lập row đã persist sau mỗi session để lần sau đọc existing.
      dbState.userStructures = [upsertCalls[upsertCalls.length - 1].payload];
    }

    expect(upsertCalls).toHaveLength(3);
    // Mọi upsert đều nhắm CÙNG MỘT PK (user_id, structure_id) — không bao giờ
    // sinh thẻ thứ hai theo exercise/session/pattern.
    for (const { payload, opts } of upsertCalls) {
      expect(opts.onConflict).toBe('user_id,structure_id');
      expect(payload.user_id).toBe('u9');
      expect(payload.structure_id).toBe('s-same');
      expect(payload).not.toHaveProperty('exercise_id');
      expect(payload).not.toHaveProperty('pattern');
    }
    // Cùng một thẻ tiến bộ liên tục: 1 -> 2 -> 3.
    expect(upsertCalls.map((c) => c.payload.review_count)).toEqual([1, 2, 3]);
  });

  it('H2. Thiếu userId hoặc structureId -> không ghi DB (vẫn 0 upsert)', async () => {
    await recordStructureResult({ userId: '', structureId: 's1', rating: RATING.GOOD });
    await recordStructureResult({ userId: 'u1', structureId: '', rating: RATING.GOOD });
    expect(upsertCalls).toHaveLength(0);
  });
});



