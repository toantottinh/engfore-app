import { describe, it, expect } from 'vitest';
import {
  BUSINESS_TIMEZONE,
  getBusinessDateKey,
  getBusinessDateParts,
} from '../utils/time.js';

/**
 * Regression tests for the daily-progress timezone bug.
 *
 * EngFore is used in Vietnam (UTC+7). The old code derived "today" from UTC
 * (`(now() at time zone 'utc')::date` / `toISOString().slice(0, 10)`), which
 * only rolls to a new date at 07:00 Vietnam time. Between 00:00–06:59 VN the
 * app therefore kept treating yesterday as today → stale 50/50 "completed".
 *
 * These tests pin the business day to Asia/Ho_Chi_Minh so the boundary is
 * exactly 00:00 Vietnam (17:00 UTC of the previous day).
 */
describe('Business day timezone (Asia/Ho_Chi_Minh)', () => {
  it('uses Asia/Ho_Chi_Minh as the business timezone', () => {
    expect(BUSINESS_TIMEZONE).toBe('Asia/Ho_Chi_Minh');
  });

  it('returns the Vietnam date at 23:59 VN (16:59 UTC same day)', () => {
    // 2026-08-17 23:59 VN = 2026-08-17 16:59 UTC
    const iso = '2026-08-17T16:59:00Z';
    expect(getBusinessDateKey(new Date(iso))).toBe('2026-08-17');
  });

  it('rolls over at exactly 00:00 VN (17:00 UTC of the previous day)', () => {
    // 2026-08-18 00:00 VN = 2026-08-17 17:00 UTC — business day ALREADY 18/08.
    const iso = '2026-08-17T17:00:00Z';
    expect(getBusinessDateKey(new Date(iso))).toBe('2026-08-18');
  });

  it('rolls over at 00:01 VN', () => {
    const iso = '2026-08-17T17:01:00Z';
    expect(getBusinessDateKey(new Date(iso))).toBe('2026-08-18');
  });

  it('is already the new day at 06:59 VN (23:59 UTC previous day)', () => {
    // 2026-08-18 06:59 VN = 2026-08-17 23:59 UTC.
    // The OLD code used the UTC date ('2026-08-17') → yesterday's data leaked
    // into today. The fixed code must return '2026-08-18'.
    const iso = '2026-08-17T23:59:00Z';
    expect(getBusinessDateKey(new Date(iso))).toBe('2026-08-18');
    // Chứng minh bug cũ: UTC key vẫn là ngày hôm trước.
    expect(new Date(iso).toISOString().slice(0, 10)).toBe('2026-08-17');
  });

  it('stays on the new day at 07:00 VN (00:00 UTC same day)', () => {
    const iso = '2026-08-18T00:00:00Z';
    expect(getBusinessDateKey(new Date(iso))).toBe('2026-08-18');
  });

  it('proves UTC vs VN disagree during 00:00–06:59 VN', () => {
    // Bảng đối chiếu: tại các mốc giờ VN sáng sớm, UTC vẫn là ngày hôm trước.
    const cases = [
      { vn: '2026-08-18 00:00', utcIso: '2026-08-17T17:00:00Z', expected: '2026-08-18' },
      { vn: '2026-08-18 01:30', utcIso: '2026-08-17T18:30:00Z', expected: '2026-08-18' },
      { vn: '2026-08-18 06:59', utcIso: '2026-08-17T23:59:00Z', expected: '2026-08-18' },
      { vn: '2026-08-18 07:00', utcIso: '2026-08-18T00:00:00Z', expected: '2026-08-18' },
    ];
    for (const c of cases) {
      const utcDay = new Date(c.utcIso).toISOString().slice(0, 10);
      expect(utcDay).toBe(c.utcIso.slice(0, 10)); // UTC vẫn là ngày trước khi VN đổi ngày
      expect(getBusinessDateKey(new Date(c.utcIso))).toBe(c.expected);
    }
  });

  it('produces a new key each day (16/08 → 17/08 → 18/08)', () => {
    const day16 = new Date('2026-08-16T12:00:00Z'); // VN 19:00 16/08
    const day17 = new Date('2026-08-17T02:00:00Z'); // VN 09:00 17/08
    const day18 = new Date('2026-08-17T17:00:01Z'); // VN 00:00:01 18/08
    expect(getBusinessDateKey(day16)).toBe('2026-08-16');
    expect(getBusinessDateKey(day17)).toBe('2026-08-17');
    expect(getBusinessDateKey(day18)).toBe('2026-08-18');
  });

  it('getBusinessDateParts returns numeric parts in VN date', () => {
    const parts = getBusinessDateParts(new Date('2026-08-17T17:00:00Z'));
    expect(parts).toEqual({ year: '2026', month: '08', day: '18' });
  });
});
