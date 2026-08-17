import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.jsx';
import { getCefrStats, getVocabularySets } from '../../services/vocabulary.service.js';
import { getSrsDashboardStats } from '../../services/learning.service.js';
import { getDailyGoalProgress, getBusinessDateKey } from '../../services/dailyGoal.service.js';
import { cefrBadgeClass } from '../../utils/cefr.js';
import Spinner from '../../components/ui/Spinner.jsx';

const CEFR_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'UNKNOWN'];

const StatCard = ({ title, value, className = '' }) => (
  <div className={`rounded-xl border border-border-color bg-surface-sidebar p-5 ${className}`}>
    <p className="text-sm text-text-secondary">{title}</p>
    <p className="mt-1 text-3xl font-bold text-text-primary">{value}</p>
  </div>
);

export default function App() {
  const { user, profile } = useAuth();
  const [cefrStats, setCefrStats] = useState(null);
  const [vocabStats, setVocabStats] = useState({ sets: 0, words: 0 });

  useEffect(() => {
    let mounted = true;
    if (user?.id) {
      getCefrStats(user.id).then(({ data }) => {
        if (mounted) setCefrStats(data);
      });
      getVocabularySets(user.id).then(({ data }) => {
        if (mounted && data) {
          const totalWords = data.reduce((sum, set) => sum + (set.word_count || 0), 0);
          setVocabStats({
            sets: data.length,
            words: totalWords,
          });
        }
      });
    }
    return () => {
      mounted = false;
    };
  }, [user?.id]);

  // SRS dashboard stats
  const [srsLoading, setSrsLoading] = useState(true);
  const [srsError, setSrsError] = useState(null);
  const [srsStats, setSrsStats] = useState(null);

  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    if (!user?.id) return;
    async function load() {
      setSrsLoading(true);
      setSrsError(null);

      // If Review forwarded pre-fetched stats, use them immediately and skip fetching
      if (location?.state && location.state.srsStats) {
        if (!mounted) return;
        setSrsStats(location.state.srsStats);
        setSrsLoading(false);
        // Clear navigation state to avoid reusing it
        try {
          navigate(location.pathname, { replace: true, state: {} });
        } catch (e) {
          // ignore
        }
        return;
      }

      const { data, error } = await getSrsDashboardStats(user.id);
      if (!mounted) return;
      setSrsLoading(false);
      if (error) {
        setSrsError(error);
        setSrsStats(null);
      } else {
        setSrsStats(data);
      }

      // If navigated here with reviewCompleted flag (but no pre-fetched stats), clear it to avoid repeated refetches
      if (location?.state && location.state.reviewCompleted) {
        try {
          navigate(location.pathname, { replace: true, state: {} });
        } catch (e) {
          // ignore
        }
      }
    }
    load();
    return () => {
      mounted = false;
    };
    // Re-run when user changes or when reviewCompleted flag toggles
  }, [user?.id, location?.state?.reviewCompleted]);

  // Daily goal progress (per business day VN). Data comes from the
  // get_daily_goal_progress RPC which filters log_date = today's Vietnam date,
  // so a brand-new day returns 0 — never yesterday's count.
  const [dailyGoal, setDailyGoal] = useState(null);
  const [dailyGoalLoading, setDailyGoalLoading] = useState(true);
  const lastBusinessDayRef = useRef(getBusinessDateKey());

  useEffect(() => {
    let mounted = true;
    if (user?.id) {
      setDailyGoalLoading(true);
      getDailyGoalProgress(user.id).then(({ data, error }) => {
        if (!mounted) return;
        setDailyGoalLoading(false);
        if (!error && data) setDailyGoal(data);
      });
    }
    return () => {
      mounted = false;
    };
    // Refetch on mount, user change and after a review session navigates back.
  }, [user?.id, location?.state?.reviewCompleted]);

  // Khi đồng hồ qua 00:00 Việt Nam (ngày business mới), refetch daily goal để
  // KHÔNG giữ state 50/50 của ngày hôm trước.
  useEffect(() => {
    const id = setInterval(() => {
      const today = getBusinessDateKey();
      if (today !== lastBusinessDayRef.current) {
        lastBusinessDayRef.current = today;
        if (user?.id) {
          getDailyGoalProgress(user.id).then(({ data }) => {
            if (data) setDailyGoal(data);
          });
        }
      }
    }, 60 * 1000);
    return () => clearInterval(id);
  }, [user?.id]);

  const firstName = profile?.username || user?.email?.split('@')[0] || 'bạn';

  return (
    <div className="space-y-8">
      <div>
        <p className="text-lg text-text-secondary">Chào mừng trở lại 👋</p>
        <h1 className="text-3xl font-bold text-text-primary capitalize">{firstName}</h1>
      </div>

      {/* Thống kê tổng quan */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard title="Bộ từ" value={vocabStats.sets} />
        <StatCard title="Từ vựng" value={vocabStats.words} />
        {/* Mục tiêu hôm nay — đọc từ RPC get_daily_goal_progress (ngày VN) */}
        <div
          className={`rounded-xl border bg-surface-sidebar p-5 ${
            dailyGoal?.completed ? 'border-green-500/30 bg-green-500/10' : 'border-border-color'
          }`}
        >
          <p className="text-sm text-text-secondary">Mục tiêu hôm nay</p>
          <p className="mt-1 text-3xl font-bold text-text-primary">
            {dailyGoalLoading
              ? '…'
              : `${dailyGoal?.words_learned ?? 0} / ${dailyGoal?.daily_goal ?? 0}`}
          </p>
          {!dailyGoalLoading && dailyGoal && dailyGoal.daily_goal > 0 && (
            <p
              className={`mt-1 text-xs font-medium ${
                dailyGoal.completed ? 'text-green-400' : 'text-text-secondary'
              }`}
            >
              {dailyGoal.completed ? 'Đã hoàn thành hôm nay ✅' : 'Chưa hoàn thành hôm nay'}
            </p>
          )}
        </div>
      </div>

      {/* Hôm nay */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-text-primary">Hôm nay</h2>
        {srsLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="h-24 animate-pulse rounded-xl bg-surface-sidebar"></div>
            <div className="h-24 animate-pulse rounded-xl bg-surface-sidebar"></div>
            <div className="h-24 animate-pulse rounded-xl bg-surface-sidebar"></div>
          </div>
        ) : srsError ? (
          <div className="text-sm text-red-500">Không thể tải số liệu học tập.</div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard title="Cần học" value={srsStats?.new ?? 0} />
            <StatCard title="Cần ôn" value={srsStats?.due ?? 0} />
            <StatCard
              title="Tổng cộng"
              value={(srsStats?.new ?? 0) + (srsStats?.due ?? 0)}
              className="border-brand-primary bg-brand-primary/10"
            />
          </div>
        )}
      </div>

      {/* Ôn tập SRS */}
      <div className="space-y-4 rounded-xl border border-border-color bg-surface-sidebar p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-xl font-semibold text-text-primary">Ôn tập (SRS)</h2>
          {srsStats && srsStats.due > 0 && (
            <Link
              to="/learn"
              className="inline-flex items-center justify-center rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-primary/80"
            >
              Bắt đầu ôn tập
            </Link>
          )}
        </div>

        {srsLoading ? (
          <div className="flex h-16 items-center justify-center">
            <Spinner />
          </div>
        ) : srsError ? (
          <div className="text-sm text-red-500">Không thể tải số liệu ôn tập.</div>
        ) : srsStats ? (
          srsStats.due === 0 && srsStats.new === 0 ? (
             <div className="rounded-lg border border-green-500/20 bg-green-500/10 p-4 text-center">
                <p className="text-sm font-medium text-green-300">Bạn đã hoàn thành mọi thứ cho hôm nay! 🎉</p>
             </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              {[
                { label: 'Đến hạn', value: srsStats.due },
                { label: 'Mới', value: srsStats.new },
                { label: 'Đang học', value: srsStats.learning },
                { label: 'Học lại', value: srsStats.relearning },
                { label: 'Trưởng thành', value: srsStats.review },
              ].map((stat) => (
                <div key={stat.label} className="flex items-center gap-2 rounded-md bg-surface-default px-3 py-1.5">
                  <span className="text-xs text-text-secondary">{stat.label}</span>
                  <span className="text-sm font-semibold text-text-primary">{stat.value}</span>
                </div>
              ))}
            </div>
          )
        ) : null}
      </div>

      {/* Thống kê theo cấp độ CEFR */}
      {cefrStats && cefrStats.total > 0 && (
        <div className="space-y-4 rounded-xl border border-border-color bg-surface-sidebar p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-semibold text-text-primary">Phân bố cấp độ CEFR</h2>
            <span className="text-sm text-text-secondary">{cefrStats.total} từ</span>
          </div>
          <div className="flex flex-wrap gap-3">
            {CEFR_ORDER.map((level) => {
              const count = cefrStats[level] ?? 0;
              return (
                <div key={level} className="flex items-center gap-2 rounded-md bg-surface-default px-3 py-1.5">
                  <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${cefrBadgeClass(level === 'UNKNOWN' ? null : level)}`}>
                    {level === 'UNKNOWN' ? 'Chưa xác định' : level}
                  </span>
                  <span className="text-sm font-semibold text-text-primary">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}
