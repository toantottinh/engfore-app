/**
 * Chuyển đổi ISO timestamp thành chuỗi thời gian thân thiện với người dùng.
 * @param {string | null} isoString - Chuỗi ISO timestamp của `review_due_at`.
 * @returns {string} - Chuỗi đã định dạng, ví dụ: "Ôn lại sau 10 phút".
 */
export function formatReviewTime(isoString) {
  if (!isoString) {
    return 'Chưa có lịch ôn tập';
  }

  const dueDate = new Date(isoString);
  const now = new Date();
  const diffSeconds = (dueDate.getTime() - now.getTime()) / 1000;

  if (diffSeconds <= 0) {
    return 'Ôn lại ngay';
  }

  const diffMinutes = diffSeconds / 60;
  if (diffMinutes < 1) {
    return 'Ôn lại ngay';
  }
  if (diffMinutes < 60) {
    return `Ôn lại sau ${Math.round(diffMinutes)} phút`;
  }

  const diffHours = diffMinutes / 60;
  if (diffHours < 24) {
    return `Ôn lại sau ${Math.round(diffHours)} giờ`;
  }

  const diffDays = diffHours / 24;
  return `Ôn lại sau ${Math.round(diffDays)} ngày`;
}

/**
 * Múi giờ business của EngFore.
 *
 * EngFore được dùng chủ yếu bởi người học tại Việt Nam, nên ngày business
 * (mốc "hôm nay" cho daily goal / daily NEW quota) là ngày theo
 * Asia/Ho_Chi_Minh (UTC+7). KHÔNG được dùng UTC để quyết định "hôm nay":
 * từ 00:00 đến 06:59 Việt Nam, ngày UTC vẫn còn là ngày hôm trước — chính là
 * nguyên nhân khiến daily progress hiển thị 50/50 của hôm qua và không reset.
 */
export const BUSINESS_TIMEZONE = 'Asia/Ho_Chi_Minh';

/** Formatter cố định theo BUSINESS_TIMEZONE (reuse để không tạo formatter mỗi lần). */
const businessDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Lấy thành phần ngày (năm/tháng/ngày) theo ngày business Việt Nam.
 * @param {Date|string|number} [date=new Date()]
 * @returns {{ year: string, month: string, day: string }}
 */
export function getBusinessDateParts(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const parts = businessDateFormatter.formatToParts(d);
  const pick = (type) => parts.find((p) => p.type === type)?.value || '';
  return { year: pick('year'), month: pick('month'), day: pick('day') };
}

/**
 * Key ngày business Việt Nam dạng "YYYY-MM-DD".
 *
 * Dùng chung cho:
 *   - `daily_learning_log.log_date` (daily goal words_learned hôm nay);
 *   - `daily_new_progress.day` (quota từ mới trong ngày);
 *   - bất kỳ logic nào cần phân biệt "hôm nay" vs "hôm qua".
 *
 * Ngày mới (00:00 Việt Nam) tự động tạo key mới, nên ngày hôm sau không bao
 * giờ kế thừa số liệu của ngày hôm trước.
 * @param {Date|string|number} [date=new Date()]
 * @returns {string} "YYYY-MM-DD" (Asia/Ho_Chi_Minh)
 */
export function getBusinessDateKey(date = new Date()) {
  const { year, month, day } = getBusinessDateParts(date);
  return `${year}-${month}-${day}`;
}
