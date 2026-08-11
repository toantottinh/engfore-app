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