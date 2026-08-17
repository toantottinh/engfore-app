/**
 * Pure (no-side-effect) logic for the "Daily NEW limit" feature.
 *
 * This module is intentionally free of any Supabase import so it can be unit
 * tested in isolation and reused by both the hook and the UI without mock setup.
 *
 * Rules implemented here (see the feature spec):
 *  - A NEW card counts against the daily quota exactly ONCE — the first time it
 *    is rated (i.e. introduced into learning). Again/F2/typing retries never
 *    consume additional quota (enforced via the idempotent introduced-set).
 *  - Already-introduced words are skipped so they keep their place in the SRS
 *    pipeline without burning NEW quota again.
 *  - Review / learning / relearning words are unlimited — only NEW is capped.
 */

// Business timezone helpers (Asia/Ho_Chi_Minh) — xem src/utils/time.js.
import { BUSINESS_TIMEZONE, getBusinessDateKey } from '../utils/time.js';
export { BUSINESS_TIMEZONE, getBusinessDateKey };

/** Default NEW cards a user may introduce per day when no setting exists. */
export const DEFAULT_DAILY_NEW_LIMIT = 10;

/** Allowed daily-new-limit choices surfaced in the Settings UI. */
export const DAILY_NEW_LIMIT_OPTIONS = [5, 10, 20, 30, 50];

/** Setting key under which the daily limit is persisted in `user_settings`. */
export const DAILY_NEW_LIMIT_KEY = 'daily_new_limit';

/**
 * Resolve an arbitrary setting value into a valid daily-new-limit integer.
 * - Falls back to DEFAULT_DAILY_NEW_LIMIT when absent/invalid (NaN, null, …).
 * - Clamps into the supported options range so a misconfigured setting can
 *   never disable learning entirely (limit < 0) or explode the quota.
 * @param {*} value
 * @returns {number} a valid limit within [min, max] of DAILY_NEW_LIMIT_OPTIONS
 */
export function resolveDailyNewLimit(value) {
  const opts = DAILY_NEW_LIMIT_OPTIONS;
  const min = Math.min(...opts);
  const max = Math.max(...opts);
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_DAILY_NEW_LIMIT;
  return Math.min(Math.max(Math.round(n), min), max);
}

/**
 * Stable Vietnam business date key ("YYYY-MM-DD") used to bucket daily
 * NEW-introductions (`daily_new_progress.day`) and any other daily progress.
 *
 * EngFore targets Vietnamese learners, so the business day is
 * Asia/Ho_Chi_Minh (UTC+7). The old implementation derived the key from UTC,
 * which meant every day between 00:00 and 06:59 Vietnam time the app still
 * bucketed new words into YESTERDAY's record — the daily quota/goal looked
 * already completed before the user had studied anything that day.
 *
 * @param {Date|{}|string|number} [date=new Date()]
 * @returns {string} "YYYY-MM-DD" (Asia/Ho_Chi_Minh)
 */
export const getDailyDateKey = getBusinessDateKey;

/**
 * Select the NEW words that may be introduced to a session today.
 *
 * A word is selected (and thus eligible to consume quota) only if it has not
 * already been introduced today. The selection is then capped by the
 * remaining quota: `dailyNewLimit - introducedToday`.
 *
 * @param {Array} newWords           NEW words fetched for the session (one set)
 * @param {number} dailyNewLimit      quota for the day (already resolved)
 * @param {Array<string|number>} introducedTodayIds  word_sense_ids introduced today
 * @returns {Array} NEW words allowed into the session today (<= remaining quota)
 */
export function selectNewWordsForToday(newWords, dailyNewLimit, introducedTodayIds = []) {
  const limit = resolveDailyNewLimit(dailyNewLimit);
  const introduced = new Set(
    (introducedTodayIds || []).map((id) => (id == null ? '' : String(id)))
  );
  const available = (newWords || []).filter((w) => {
    let wid = '';
    if (w) wid = String(w.id ?? w.word_sense_id ?? '');
    return !introduced.has(wid);
  });
  const remaining = Math.max(0, limit - introduced.size);
  return available.slice(0, Math.max(0, remaining));
}
