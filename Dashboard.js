export const Dashboard = () => {
    // Dữ liệu giả lập, sau này sẽ lấy từ database
    const stats = {
        todayGoal: 50,
        wordsLearned: 12,
        reviewToday: 25,
        learningStreak: 5
    };

    return `
        <div class="dashboard-grid">
            <div class="stat-card">
                <h3>Today's Goal</h3>
                <p>${stats.wordsLearned} / ${stats.todayGoal}</p>
            </div>
            <div class="stat-card">
                <h3>Review Today</h3>
                <p>${stats.reviewToday}</p>
            </div>
            <div class="stat-card">
                <h3>Learning Streak</h3>
                <p>${stats.learningStreak} days 🔥</p>
            </div>
        </div>
        <h2>Continue Learning</h2>
        <!-- Nơi hiển thị các bộ từ vựng gần đây -->
    `;
};