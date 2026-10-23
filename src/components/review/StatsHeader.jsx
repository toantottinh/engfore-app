export default function StatsHeader({ newToday, dailyGoal, total, learning, newWords }) {
  return (
    <div className="stats-header">
      <div className="progress-line">
        Từ mới hôm nay: <strong>{newToday}</strong> / {dailyGoal}
      </div>
      <div className="stats-boxes">
        <div className="stat-box"><span>Tổng cộng</span><strong>{total}</strong></div>
        <div className="stat-box"><span>Đang học</span><strong>{learning}</strong></div>
        <div className="stat-box"><span>Từ mới</span><strong>{newWords}</strong></div>
      </div>
    </div>
  );
}