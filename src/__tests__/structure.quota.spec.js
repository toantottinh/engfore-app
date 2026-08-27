import { describe, it, expect, vi, beforeEach } from 'vitest';

// ------------------------------------------------------------------
// DAILY NEW STRUCTURE LIMIT — hạn mức cấu trúc mới mỗi ngày.
//
// Phạm vi khóa behavior (required cases 7–12):
//   7.  daily limit = 5        -> tối đa 5 cấu trúc MỚI vào phiên/ngày.
//   8.  DUE + LEARNING + NEW   -> DUE & LEARNING lấy ĐẦY ĐỦ, chỉ NEW bị giới hạn.
//   9.  Đã đạt hạn mức         -> không lấy thêm cấu trúc MỚI nào nữa.
//   10. Đã đạt hạn mức + còn DUE       -> vẫn học DUE.
//   11. Đã đạt hạn mức + còn LEARNING  -> vẫn học LEARNING.
//   12. "Hôm nay" dùng business-date key Asia/Ho_Chi_Minh (getBusinessDateKey),
//       KHÔNG phải UTC.
//
// Thứ tự ưu tiên DUE → LEARNING → NEW và toàn bộ scheduler SRS không đổi.
// Chạy REAL service với supabase mock cục bộ (giống structure.srs.queue.spec.js).
// ------------------------------------------------------------------

// CASE 12 — pin business date qua seam chính thức của project (src/utils/time.js).
vi.mock('../utils/time.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getBusinessDateKey: () => '2026-08-27', // ngày business VN giả định
}));

const PINNED_DAY = '2026-08-27';

const dbState = {
  structures: [],
  user_structures: [],
  user_settings: [],
  daily_new_structure_progress: [],
};
const upsertCalls = [];
const eqCalls = []; // { table, col, value }

function applyFilters(rows, filters) {
  let out = rows;
  for (const f of filters) out = out.filter((r) => r[f.col] === f.value);
  return out;
}

function tableMock(name) {
  const rows = () => dbState[name] || [];
  const api = {};
  const filters = [];
  api.select = vi.fn(() => api);
  api.eq = vi.fn((col, value) => {
    filters.push({ col, value });
    eqCalls.push({ table: name, col, value });
    return api;
  });
  api.lte = vi.fn(() => api);
  api.gt = vi.fn(() => api);
  api.order = vi.fn(() => api);
  api.limit = vi.fn(() => api);
  api.upsert = vi.fn(async (payload, opts) => {
    upsertCalls.push({ table: name, payload, opts });
    return { data: null, error: null };
  });
  api.maybeSingle = vi.fn(async () => {
    const out = applyFilters(rows(), filters);
    return { data: out[0] ?? null, error: null };
  });
  api.then = (onFulfilled, onRejected) =>
    Promise.resolve({ data: applyFilters(rows(), filters), error: null }).then(
      onFulfilled,
      onRejected
    );
  return api;
}

vi.mock('../services/supabase.js', () => ({
  supabase: { from: (name) => tableMock(name) },
}));

import {
  DEFAULT_DAILY_NEW_STRUCTURE_LIMIT,
  DAILY_NEW_STRUCTURE_LIMIT_OPTIONS,
  resolveDailyNewStructureLimit,
  selectNewStructuresForToday,
} from '../services/quota.service.js';
import {
  getStructureSessionQueue,
  getUserDailyNewStructureLimit,
  getDailyNewStructureProgress,
  markNewStructureIntroduced,
  updateDailyNewStructureLimit,
} from '../services/structure-learning.service.js';

const NOW_PLUS = (hours) => new Date(Date.now() + hours * 3600 * 1000).toISOString();
const NOW_MINUS = (hours) => new Date(Date.now() - hours * 3600 * 1000).toISOString();

/** Cảnh DB: 2 DUE + 2 LEARNING + N NEW (NEW xếp theo created_at asc). */
function seedDb({ fresh = 7 }) {
  dbState.structures = [
    { id: 'd1', pattern: 'Due A', created_at: '2026-01-01T00:00:00Z' },
    { id: 'd2', pattern: 'Due B', created_at: '2026-01-02T00:00:00Z' },
    { id: 'l1', pattern: 'Learn A', created_at: '2026-01-03T00:00:00Z' },
    { id: 'l2', pattern: 'Learn B', created_at: '2026-01-04T00:00:00Z' },
    ...Array.from({ length: fresh }, (_, i) => ({
      id: `n${i + 1}`,
      pattern: `New ${i + 1}`,
      created_at: new Date(Date.parse('2026-02-01T00:00:00Z') + i * 60000).toISOString(),
    })),
  ];
  dbState.user_structures = [
    { user_id: 'u1', structure_id: 'd1', state: 'review', review_due_at: NOW_MINUS(2) },
    { user_id: 'u1', structure_id: 'd2', state: 'review', review_due_at: NOW_MINUS(1) },
    { user_id: 'u1', structure_id: 'l1', state: 'learning' },
    { user_id: 'u1', structure_id: 'l2', state: 'relearning' },
  ]; // n1..nN KHÔNG có row -> NEW
}

beforeEach(() => {
  dbState.structures = [];
  dbState.user_structures = [];
  dbState.user_settings = [];
  dbState.daily_new_structure_progress = [];
  upsertCalls.length = 0;
  eqCalls.length = 0;
});

describe('pure helpers — quota.service (structure mirror)', () => {
  it('resolveDailyNewStructureLimit: default 5, clamp vào range options', () => {
    expect(DEFAULT_DAILY_NEW_STRUCTURE_LIMIT).toBe(5);
    expect(resolveDailyNewStructureLimit(undefined)).toBe(DEFAULT_DAILY_NEW_STRUCTURE_LIMIT);
    expect(resolveDailyNewStructureLimit(null)).toBe(DEFAULT_DAILY_NEW_STRUCTURE_LIMIT);
    expect(resolveDailyNewStructureLimit(NaN)).toBe(DEFAULT_DAILY_NEW_STRUCTURE_LIMIT);
    expect(resolveDailyNewStructureLimit(99)).toBe(Math.max(...DAILY_NEW_STRUCTURE_LIMIT_OPTIONS));
    expect(resolveDailyNewStructureLimit(0)).toBe(Math.min(...DAILY_NEW_STRUCTURE_LIMIT_OPTIONS));
    expect(DAILY_NEW_STRUCTURE_LIMIT_OPTIONS).toEqual([5, 10, 20, 30, 50]);
  });

  it('selectNewStructuresForToday: loại cấu trúc đã giới thiệu hôm nay và chỉ còn hạn mức dư', () => {
    const fresh = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
    // Hạn mức 5, đã giới thiệu b và c -> còn 3 slot, lấy được a,d tiếp theo...
    expect(selectNewStructuresForToday(fresh, 5, ['b', 'c'])).toEqual([{ id: 'a' }, { id: 'd' }]);
    // Đã giới thiệu 5/5 (limit clamps về 5) -> không còn slot -> rỗng dù còn hàng mới.
    expect(selectNewStructuresForToday(fresh, 5, ['a', 'b', 'c', 'd', 'x'])).toEqual([]);
  });
});

describe('CASE 7–8 — getStructureSessionQueue áp hạn mức CHỈ lên nhóm NEW', () => {
  it('CASE 7. limit 5 -> tối đa 5 cấu trúc MỚI vào phiên', async () => {
    seedDb({ fresh: 20 });
    const { data, error } = await getStructureSessionQueue('u1', {
      dailyNewStructureLimit: 5,
      introducedTodayStructureIds: [],
    });
    expect(error).toBeNull();
    const news = data.filter((s) => /^n/.test(s.id));
    expect(news).toHaveLength(5); // KHÔNG phải toàn bộ 20 cấu trúc mới
    expect(news.map((s) => s.id)).toEqual(['n1', 'n2', 'n3', 'n4', 'n5']); // thứ tự giữ nguyên
  });

  it('CASE 8. Có DUE + LEARNING + NEW -> DUE/LEARNING lấy đầy đủ, NEW bị cắt còn hạn mức', async () => {
    seedDb({ fresh: 20 });
    const { data, error } = await getStructureSessionQueue('u1', {
      dailyNewStructureLimit: 5,
      introducedTodayStructureIds: [],
    });
    expect(error).toBeNull();
    // KHÔNG phải chỉ 5 item tổng cộng: 2 DUE + 2 LEARNING + 5 NEW = 9.
    expect(data.map((s) => s.id)).toEqual([
      'd1', 'd2',                   // DUE trước (due asc)
      'l1', 'l2',                   // LEARNING giữa
      'n1', 'n2', 'n3', 'n4', 'n5', // NEW sau (created asc), bị cap 5
    ]);
  });

  it('Đã giới thiệu một phần hôm nay -> hạn mức còn lại giảm đúng', async () => {
    seedDb({ fresh: 10 });
    const { data } = await getStructureSessionQueue('u1', {
      dailyNewStructureLimit: 5,
      introducedTodayStructureIds: ['n1', 'n3'], // đã đốt 2 slot
    });
    // remaining 3; các structure đã giới thiệu bị loại khỏi nhóm NEW.
    expect(data.filter((s) => /^n/.test(s.id)).map((s) => s.id)).toEqual(['n2', 'n4', 'n5']);
  });
});

describe('CASES 9–11 — hết hạn mức nhưng DUE / LEARNING vẫn phải được học', () => {
  beforeEach(() => seedDb({ fresh: 7 }));

  function caseOptions() {
    return {
      dailyNewStructureLimit: 5,
      introducedTodayStructureIds: ['n1', 'n2', 'n3', 'n4', 'n5'], // đủ 5/ngày
    };
  }

  it('CASE 9. Đã đạt hạn mức -> không lấy thêm cấu trúc NEW nào', async () => {
    const { data } = await getStructureSessionQueue('u1', caseOptions());
    expect(data.filter((s) => /^n/.test(s.id))).toHaveLength(0);
  });

  it('CASE 10. Đã đạt hạn mức nhưng còn DUE -> vẫn có DUE trong phiên', async () => {
    const { data } = await getStructureSessionQueue('u1', caseOptions());
    expect(data.map((s) => s.id)).toContain('d1');
    expect(data.map((s) => s.id)).toContain('d2');
  });

  it('CASE 11. Đã đạt hạn mức nhưng còn LEARNING -> vẫn có LEARNING trong phiên', async () => {
    const { data } = await getStructureSessionQueue('u1', caseOptions());
    expect(data.map((s) => s.id)).toContain('l1');
    expect(data.map((s) => s.id)).toContain('l2');
  });

  it('Không truyền options -> behavior cũ (không giới hạn) giữ nguyên cho backward compat', async () => {
    const { data } = await getStructureSessionQueue('u1');
    expect(data.map((s) => s.id)).toEqual([
      'd1', 'd2', 'l1', 'l2',
      'n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7',
    ]);
  });
});

describe('CASE 12 — persistence dùng business-date key Asia/Ho_Chi_Minh', () => {
  it('getDailyNewStructureProgress query đúng day = getBusinessDateKey()', async () => {
    dbState.daily_new_structure_progress = [
      { user_id: 'u1', day: PINNED_DAY, structure_id: 'n1' },
      { user_id: 'u1', day: '2020-01-01', structure_id: 'old' },
    ];
    const { data, error } = await getDailyNewStructureProgress('u1');
    expect(error).toBeNull();
    expect(data).toEqual(['n1']);
    // Query PHẢI lọc theo business-day key (pinned) chứ không phải UTC date.
    expect(eqCalls).toContainEqual({
      table: 'daily_new_structure_progress',
      col: 'day',
      value: PINNED_DAY,
    });
  });

  it('markNewStructureIntroduced upsert đúng bảng + day nghiệp vụ + idempotent keys', async () => {
    const { error } = await markNewStructureIntroduced('u1', 'n9');
    expect(error).toBeNull();
    expect(upsertCalls).toHaveLength(1);
    const { table, payload, opts } = upsertCalls[0];
    expect(table).toBe('daily_new_structure_progress');
    expect(payload).toEqual({ user_id: 'u1', day: PINNED_DAY, structure_id: 'n9' });
    expect(opts.onConflict).toBe('user_id,day,structure_id');
  });

  it('getUserDailyNewStructureLimit đọc user_settings key riêng cho structure', async () => {
    dbState.user_settings = [
      { user_id: 'u1', key: 'daily_new_structure_limit', value_jsonb: 10 },
      { user_id: 'u1', key: 'daily_new_limit', value_jsonb: 50 },
    ];
    const { value } = await getUserDailyNewStructureLimit('u1');
    expect(value).toBe(10);
    expect(eqCalls).toContainEqual({
      table: 'user_settings',
      col: 'key',
      value: 'daily_new_structure_limit',
    });
  });

  it('updateDailyNewStructureLimit persist và trả về giá trị đã resolve', async () => {
    const { value, error } = await updateDailyNewStructureLimit('u1', 99);
    expect(error).toBeNull();
    expect(value).toBe(50); // clamp về max options
    expect(upsertCalls[0].payload.value_jsonb).toBe(50);
    expect(upsertCalls[0].payload.key).toBe('daily_new_structure_limit');
  });
});