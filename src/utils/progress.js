/** Utils for displaying mastery and review time labels (Vietnamese) */
export function masteryLabel(level) {
  const l = Number(level) || 0;
  if (l === 0) return 'Chưa học';
  if (l === 5) return 'Đã thuộc';
  if (l >= 3) return 'Khá thành thạo';
  return 'Đang học';
}

export function masteryFraction(level) {
  const l = Number(level) || 0;
  return `${l}/5`;
}

export function formatReviewDue(reviewDueIso) {
  if (!reviewDueIso) return 'Chưa có lịch';
  const due = Date.parse(reviewDueIso);
  if (Number.isNaN(due)) return '—';
  const diff = due - Date.now();

  if (diff <= 60 * 1000) return 'Ôn lại ngay bây giờ';

  const minutes = Math.round(diff / (1000 * 60));
  if (minutes < 60) return `Ôn lại sau ${minutes} phút`;

  const hours = Math.round(diff / (1000 * 60 * 60));
  if (hours < 48) return `Ôn lại sau ${hours} giờ`;

  const days = Math.round(diff / (1000 * 60 * 60 * 24));
  return `Ôn lại sau ${days} ngày`;
}
