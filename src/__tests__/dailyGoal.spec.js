import { describe, it, expect } from 'vitest';
import {
  computeDailyGoalStatus,
  resolveDailyProgressForDate,
  getTodayKey,
  getBusinessDateKey,
} from '../services/dailyGoal.service.js';

/**
 * Regression tests for "mỗi ngày phải có một daily progress độc lập".
 *
 * Test 1-5 trong task:
 *   - Ngày 16/08: progress 50 / goal 50 → completed
 *   - Sang ngày 17/08: progress 0 / goal 50 → chưa hoàn thành
 *   - 17/08 học thêm 10: progress 10 → chưa hoàn thành
 *   - 17/08 học đủ 50: progress 50 → completed
 *   - Ngày 18/08: progress 0 → chưa hoàn thành
 *
 * Ngày mới tuyệt đối không được kế thừa số lượng đã học của ngày hôm trước.
 */
const GOAL = 50;

describe('computeDailyGoalStatus', () => {
  it('Test 1 — Ngày 16/08: 50/50 → hoàn thành', () => {
    const status = computeDailyGoalStatus(50, 50);
    expect(status.wordsLearned).toBe(50);
    expect(status.dailyGoal).toBe(50);
    expect(status.completed).toBe(true);
  });

  it('Test 2 — Sang ngày 17/08 (chưa học gì): 0/50 → chưa hoàn thành', () => {
    const status = computeDailyGoalStatus(0, 50);
    expect(status.wordsLearned).toBe(0);
    expect(status.dailyGoal).toBe(50);
    expect(status.completed).toBe(false);
  });

  it('Test 3 — Ngày 17/08 học thêm 10 từ: 10/50 → chưa hoàn thành', () => {
    const status = computeDailyGoalStatus(10, 50);
    expect(status.wordsLearned).toBe(10);
    expect(status.completed).toBe(false);
  });

  it('Test 4 — Ngày 17/08 học đủ 50 từ: 50/50 → hoàn thành', () => {
    const status = computeDailyGoalStatus(50, 50);
    expect(status.wordsLearned).toBe(50);
    expect(status.completed).toBe(true);
  });

  it('Test 5 — Ngày 18/08 (chưa học gì): 0/50 → chưa hoàn thành', () => {
    const status = computeDailyGoalStatus(0, 50);
    expect(status.wordsLearned).toBe(0);
    expect(status.completed).toBe(false);
  });

  it('completed=false khi goal = 0 (chưa cấu hình goal)', () => {
    expect(computeDailyGoalStatus(0, 0).completed).toBe(false);
    expect(computeDailyGoalStatus(99, 0).completed).toBe(false);
  });
});

describe('resolveDailyProgressForDate (daily reset semantics)', () => {
  // Lịch sử thực tế: ngày 16/08 user học đủ 50 từ.
  const dailyRecords = [
    { log_date: '2026-08-16', words_learned: 50 },
  ];

  it('Ngày 17/08 KHÔNG kế thừa record ngày 16/08 → 0/50', () => {
    const status = resolveDailyProgressForDate(dailyRecords, '2026-08-17', GOAL);
    expect(status.wordsLearned).toBe(0);
    expect(status.dailyGoal).toBe(GOAL);
    expect(status.completed).toBe(false);
  });

  it('Ngày 16/08 vẫn giữ nguyên 50/50 (lịch sử không bị xóa)', () => {
    const status = resolveDailyProgressForDate(dailyRecords, '2026-08-16', GOAL);
    expect(status.wordsLearned).toBe(50);
    expect(status.completed).toBe(true);
  });

  it('17/08 học thêm 10 từ → có record mới cho 17/08, 16/08 vẫn còn nguyên', () => {
    const records = [
      { log_date: '2026-08-16', words_learned: 50 },
      { log_date: '2026-08-17', words_learned: 10 },
    ];
    expect(resolveDailyProgressForDate(records, '2026-08-16', GOAL).wordsLearned).toBe(50);
    const day17 = resolveDailyProgressForDate(records, '2026-08-17', GOAL);
    expect(day17.wordsLearned).toBe(10);
    expect(day17.completed).toBe(false);
  });

  it('17/08 học đủ 50 → completed, sang 18/08 lại là 0', () => {
    const records = [
      { log_date: '2026-08-16', words_learned: 50 },
      { log_date: '2026-08-17', words_learned: 50 },
    ];
    expect(resolveDailyProgressForDate(records, '2026-08-17', GOAL).completed).toBe(true);
    expect(resolveDailyProgressForDate(records, '2026-08-18', GOAL).wordsLearned).toBe(0);
    expect(resolveDailyProgressForDate(records, '2026-08-18', GOAL).completed).toBe(false);
  });

  it('Hỗ trợ record dạng daily_new_progress ({ day })', () => {
    const rows = [{ day: '2026-08-16', word_sense_id: 'x' }];
    // words_learned không có → đếm là 1 record hôm đó (đã giới thiệu từ mới).
    expect(resolveDailyProgressForDate(rows, '2026-08-16', GOAL).wordsLearned).toBe(1);
    expect(resolveDailyProgressForDate(rows, '2026-08-17', GOAL).wordsLearned).toBe(0);
  });

  it('Không có record nào → 0, không crash', () => {
    const status = resolveDailyProgressForDate([], getTodayKey(), GOAL);
    expect(status.wordsLearned).toBe(0);
    expect(status.completed).toBe(false);
  });
});

describe('dailyGoal helpers export ngày business', () => {
  it('getTodayKey khớp với getBusinessDateKey(new Date())', () => {
    expect(getTodayKey()).toBe(getBusinessDateKey());
  });
});
