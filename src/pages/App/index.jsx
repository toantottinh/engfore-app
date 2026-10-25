import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.jsx';
import { getCefrStats, getVocabularySets } from '../../services/vocabulary.service.js';
import { getSrsDashboardStats } from '../../services/learning.service.js';
import { getDailyGoalProgress, getBusinessDateKey } from '../../services/dailyGoal.service.js';
import HelpModal, { HelpButton } from '../../components/HelpModal.jsx';

const CEFR_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'UNKNOWN'];

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
  const [helpOpen, setHelpOpen] = useState(false);

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
  const dueCount = srsStats?.due ?? 0;
  const newCount = srsStats?.new ?? 0;
  const learningCount = srsStats?.learning ?? 0;
  const relearningCount = srsStats?.relearning ?? 0;
  const reviewCount = srsStats?.review ?? 0;
  const taskTotal = newCount + dueCount;

  const dailyLearned = dailyGoal?.words_learned ?? 0;
  const dailyGoalTotal = dailyGoal?.daily_goal ?? 0;
  const dailyPercent =
    dailyGoalTotal > 0 ? Math.min(100, Math.round((dailyLearned / dailyGoalTotal) * 100)) : 0;

  const cefrTotal = cefrStats?.total ?? 0;
  const cefrColors = {
    A1: 'bg-emerald-500',
    A2: 'bg-green-500',
    B1: 'bg-blue-500',
    B2: 'bg-violet-400',
    C1: 'bg-purple-600',
    C2: 'bg-orange-500',
    UNKNOWN: 'bg-slate-400',
  };
  const cefrBadgeColors = {
    A1: 'bg-emerald-100 text-emerald-700',
    A2: 'bg-green-100 text-green-700',
    B1: 'bg-blue-100 text-blue-700',
    B2: 'bg-violet-100 text-violet-700',
    C1: 'bg-purple-100 text-purple-700',
    C2: 'bg-orange-100 text-orange-700',
    UNKNOWN: 'bg-slate-100 text-slate-700',
  };



  return (
    <div className="space-y-8">
      {/* Hero: lời chào + hành động nhanh */}
      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <p className="text-lg text-text-secondary">Chào mừng trở lại 👋</p>
            <h1 className="text-3xl font-bold text-text-primary capitalize">{firstName}</h1>
            <p className="text-base text-text-secondary">
              Bạn có <span className="font-semibold text-brand-primary">{dueCount}</span> từ cần ôn tập hôm nay.
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 lg:items-end">
            <div className="flex flex-wrap items-center gap-2">
              <HelpButton onClick={() => setHelpOpen(true)} label="Hướng dẫn" />
              <Link
                to="/profile"
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900 active:scale-95"
              >
                <svg className="mr-1.5 h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                </svg>
                Từ mới mỗi ngày
              </Link>
              <Link
                to="/learn"
                className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-3 text-base font-semibold text-white shadow-md transition-all hover:from-indigo-600 hover:to-purple-700 hover:shadow-lg active:scale-95"
              >
                Bắt đầu ôn tập
              </Link>
            </div>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          {[
            { label: 'Đến hạn', value: dueCount, color: 'bg-rose-100 text-rose-700' },
            { label: 'Mới', value: newCount, color: 'bg-sky-100 text-sky-700' },
          ].map((stat) => (
            <span
              key={stat.label}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${stat.color}`}
            >
              {stat.label}
              <span className="font-semibold">{stat.value}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-text-secondary">Tổng bộ từ</p>
              <p className="text-2xl font-bold text-text-primary">{vocabStats.sets}</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 text-purple-600">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-text-secondary">Tổng từ vựng</p>
              <p className="text-2xl font-bold text-text-primary">{vocabStats.words}</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-text-secondary">Nhiệm vụ hôm nay</p>
              <p className="text-2xl font-bold text-text-primary">{taskTotal}</p>
              <p className="text-xs text-text-secondary">{dueCount} từ đến hạn</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm text-text-secondary">Mục tiêu hôm nay</p>
              <p className="text-2xl font-bold text-text-primary">
                {dailyGoalLoading ? '…' : `${dailyLearned} / ${dailyGoalTotal}`}
              </p>
              {!dailyGoalLoading && dailyGoalTotal > 0 && (
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all"
                    style={{ width: `${dailyPercent}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Phân bố cấp độ CEFR */}
      {cefrStats && cefrStats.total > 0 && (
        <div className="space-y-4 rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-semibold text-text-primary">Phân bố cấp độ CEFR</h2>
            <span className="text-sm text-text-secondary">{cefrStats.total} từ</span>
          </div>

          {/* Stacked progress bar */}
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
            {CEFR_ORDER.map((level) => {
              const count = cefrStats[level] ?? 0;
              const pct = cefrTotal > 0 ? (count / cefrTotal) * 100 : 0;
              if (pct <= 0) return null;
              return (
                <div
                  key={level}
                  className={`${cefrColors[level]} h-full`}
                  style={{ width: `${pct}%` }}
                  title={`${level === 'UNKNOWN' ? 'Chưa xác định' : level}: ${count}`}
                />
              );
            })}
          </div>

          <div className="flex flex-wrap gap-3">
            {CEFR_ORDER.map((level) => {
              const count = cefrStats[level] ?? 0;
              return (
                <div key={level} className="flex items-center gap-2 rounded-md bg-slate-50 px-3 py-1.5">
                  <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${cefrBadgeColors[level]}`}>
                    {level === 'UNKNOWN' ? 'Chưa xác định' : level}
                  </span>
                  <span className="text-sm font-semibold text-text-primary">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <HelpModal
        isOpen={helpOpen}
        onClose={() => setHelpOpen(false)}
        title="Hướng dẫn Trang chủ & Chỉ số"
        items={[
          { title: 'Theo dõi chỉ số', text: 'Nắm nhanh số từ đến hạn ôn tập hôm nay và tiến độ hoàn thành mục tiêu ngày.' },
          { title: 'Thuật toán SRS', text: 'Hệ thống tự động căn thời điểm vàng để nhắc bạn ôn tập trước khi từ vựng bị quên lãng.' },
          { title: 'Từ mới mỗi ngày', text: 'Bấm nút "Từ mới mỗi ngày" để vào trang Hồ sơ chỉnh sửa hạn mức nạp từ theo khả năng.' },
        ]}
      />
    </div>
  );
}
