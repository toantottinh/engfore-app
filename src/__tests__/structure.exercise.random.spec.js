import { describe, it, expect } from 'vitest';
import { selectRandomStructureExercise } from '../utils/structure-status.js';

// ------------------------------------------------------------------
// CHECKPOINT 8 (A + H) — Random exercise selector (pure).
//
//   [] -> null
//   [one] -> chính exercise đó
//   [many] -> MỘT phần tử thuộc array
//   KHÔNG mutate input
//   H: hai lần chọn liên tiếp ĐỀU hợp lệ — KHÔNG yêu cầu uniqueness
//      (chọn trùng bài cũ không phải bug với V1).
// ------------------------------------------------------------------

describe('selectRandomStructureExercise', () => {
  const bank = Array.from({ length: 20 }, (_, i) => ({ id: `x${i}`, question: `Q${i}` }));

  it('A1. Ngân hàng rỗng -> null', () => {
    expect(selectRandomStructureExercise([])).toBeNull();
  });

  it('A2. Input không phải mảng (null/undefined/obj) -> null, không crash', () => {
    expect(selectRandomStructureExercise(null)).toBeNull();
    expect(selectRandomStructureExercise(undefined)).toBeNull();
    expect(selectRandomStructureExercise({ id: 'x' })).toBeNull();
  });

  it('A3. Đúng một exercise -> trả về CHÍNH exercise đó (same reference)', () => {
    const only = { id: 'only', type: 'fill_blank' };
    for (let i = 0; i < 10; i += 1) {
      expect(selectRandomStructureExercise([only])).toBe(only);
    }
  });

  it('A4. N exercises -> mỗi lần trả về MỘT phần tử thuộc ngân hàng', () => {
    for (let run = 0; run < 50; run += 1) {
      const picked = selectRandomStructureExercise(bank);
      expect(bank.includes(picked)).toBe(true); // reference membership
      expect(picked).toBeTruthy();
    }
  });

  it('A5. KHÔNG mutate array gốc', () => {
    const snapshot = [...bank];
    selectRandomStructureExercise(bank);
    selectRandomStructureExercise(bank);
    expect(bank).toEqual(snapshot);
    expect(bank).toHaveLength(20);
  });

  it("H. Hai lần chọn liên tiếp đều hợp lệ — được phép trùng (không enforce uniqueness)", () => {
    const single = [{ id: 'only-one', q: 'Q' }];
    // Với bank 1 phần tử: cả hai lần BUỘC phải trùng — và đó là hành vi đúng.
    const first = selectRandomStructureExercise(single);
    const second = selectRandomStructureExercise(single);
    expect(first).toBe(single[0]);
    expect(second).toBe(single[0]);
    // Không có cơ chế history/recently-seen nào giữa các lần chọn:
    expect(first).toBe(second);
  });
});
