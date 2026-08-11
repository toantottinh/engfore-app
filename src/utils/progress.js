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

export function formatReviewDue(reviewDueIso, masteryLevel) {
  if (Number(masteryLevel) === 5) return 'Đã thuộc';
  if (!reviewDueIso) return 'Chưa có lịch';
  const due = Date.parse(reviewDueIso);
  if (Number.isNaN(due)) return '—';
  const diff = due - Date.now();
  if (diff <= 0) return 'Đã đến hạn ôn';
  const hours = Math.ceil(diff / (1000 * 60 * 60));
  if (hours < 24) return `Còn ${hours} giờ`;
  const days = Math.ceil(hours / 24);
  return `Còn ${days} ngày`;
}
