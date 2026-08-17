/**
 * Daily Goal service: per-user, per-business-day word goal.
 *
 * Nguồn dữ liệu:
 *   - `users.daily_goal`            — mục tiêu số từ mới mỗi ngày của user;
 *   - `daily_learning_log`          — words_learned theo (user_id, log_date);
 *   - RPC `get_daily_goal_progress` — trả words_learned CỦA NGÀY HÔM NAY + goal;
 *   - RPC `log_learning_activity`   — tăng words_learned của ngày hôm nay.
 *
 * Ngày business là Asia/Ho_Chi_Minh (UTC+7) — xem src/utils/time.js.
 * Mỗi ngày là một record độc lập (PK user_id + log_date); ngày mới bắt đầu
 * đúng 00:00 Việt Nam và KHÔNG bao giờ kế thừa số liệu ngày hôm trước.
 */
import { supabase } from './supabase.js';
import { BUSINESS_TIMEZONE, getBusinessDateKey } from '../utils/time.js';

export { BUSINESS_TIMEZONE, getBusinessDateKey };

/**
 * Tính trạng thái daily goal từ số từ đã học và mục tiêu.
 * @param {number} wordsLearned - Số từ đã học hôm nay.
 * @param {number} dailyGoal - Mục tiêu trong ngày.
 * @returns {{ wordsLearned: number, dailyGoal: number, completed: boolean }}
 */
export function computeDailyGoalStatus(wordsLearned, dailyGoal) {
  const progress = Math.max(0, Math.round(Number(wordsLearned) || 0));
  const goal = Math.max(0, Math.round(Number(dailyGoal) || 0));
  return {
    wordsLearned: progress,
    dailyGoal: goal,
    completed: goal > 0 && progress >= goal,
  };
}

/**
 * Pure resolver: từ danh sách record theo ngày, lấy đúng record của `todayKey`
 * và tính trạng thái daily goal. Record nào không trùng ngày hôm nay bị bỏ qua
 * hoàn toàn — nếu hôm nay chưa có record thì words_learned = 0 (không phải
 * lấy record mới nhất / hôm qua).
 *
 * @param {Array<{ log_date?: string, day?: string, words_learned?: number }>} records
 * @param {string} todayKey - Key ngày business "YYYY-MM-DD".
 * @param {number} dailyGoal - Mục tiêu trong ngày.
 * @returns {{ wordsLearned: number, dailyGoal: number, completed: boolean }}
 */
export function resolveDailyProgressForDate(records, todayKey, dailyGoal = 0) {
  const rows = Array.isArray(records) ? records : [];
  const todayRecord = rows.find((r) => (r?.log_date ?? r?.day) === todayKey);
  const wordsLearned = todayRecord ? Number(todayRecord.words_learned ?? 1) : 0;
  return computeDailyGoalStatus(wordsLearned, dailyGoal);
}

/**
 * Key ngày business hôm nay (Việt Nam). Tiện ích cho UI refetch theo ngày.
 * @returns {string} "YYYY-MM-DD"
 */
export function getTodayKey() {
  return getBusinessDateKey();
}

/**
 * Lấy tiến độ daily goal hôm nay của user qua RPC `get_daily_goal_progress`.
 * RPC đã lọc `log_date = get_business_date()` (ngày Việt Nam) — record hôm nay
 * chưa tồn tại sẽ trả words_learned = 0, không trả số của hôm qua.
 * @param {string} userId
 * @returns {Promise<{ data: { words_learned: number, daily_goal: number } | null, error: object|null }>}
 */
export async function getDailyGoalProgress(userId) {
  if (!userId) return { data: null, error: { message: 'Thiếu userId.' } };
  try {
    const { data, error } = await supabase
      .rpc('get_daily_goal_progress', { p_user_id: userId })
      .maybeSingle();
    if (error) return { data: null, error };
    if (!data) return { data: { words_learned: 0, daily_goal: 0 }, error: null };
    const status = computeDailyGoalStatus(data.words_learned, data.daily_goal);
    return {
      data: {
        words_learned: status.wordsLearned,
        daily_goal: status.dailyGoal,
        completed: status.completed,
      },
      error: null,
    };
  } catch (e) {
    return { data: null, error: e };
  }
}

/**
 * Ghi nhận thêm `wordCount` từ mới học trong ngày hôm nay.
 * RPC `log_learning_activity` upsert (user_id, ngày Việt Nam) và cộng dồn.
 * @param {number} wordCount
 * @returns {Promise<{ error: object|null }>}
 */
export async function logDailyLearning(wordCount) {
  const n = Math.max(0, Math.round(Number(wordCount) || 0));
  if (n <= 0) return { error: null };
  try {
    const { error } = await supabase.rpc('log_learning_activity', { p_words_learned: n });
    return { error: error ?? null };
  } catch (e) {
    return { error: e };
  }
}

/**
 * Ghi nhận hoạt động hôm nay (cho streak) theo ngày Việt Nam.
 * @returns {Promise<{ error: object|null }>}
 */
export async function logDailyActivity() {
  try {
    const { error } = await supabase.rpc('log_daily_activity');
    return { error: error ?? null };
  } catch (e) {
    return { error: e };
  }
}
