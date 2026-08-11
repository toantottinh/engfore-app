import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.jsx';
import { useVocabulary } from '../../hooks/useVocabulary.js';
import { getCefrStats } from '../../services/vocabulary.service.js';
import { getSrsDashboardStats } from '../../services/learning.service.js';
import { cefrBadgeClass } from '../../utils/cefr.js';
import { formatReviewDue } from '../../utils/progress.js';
import Button from '../../components/ui/Button.jsx';
import Spinner from '../../components/ui/Spinner.jsx';

const CEFR_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'UNKNOWN'];

export default function App() {
  const { user, profile } = useAuth();
  const { sets, loading } = useVocabulary();
  const [cefrStats, setCefrStats] = useState(null);

  useEffect(() => {
    let mounted = true;
    if (user?.id) {
      getCefrStats(user.id).then(({ data }) => {
        if (mounted) setCefrStats(data);
      });
    }
    return () => {
      mounted = false;
    };
  }, [user?.id]);

  // SRS dashboard stats
  const [srsLoading, setSrsLoading] = useState(false);
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

  const totalWords = sets.reduce((sum, s) => sum + (s.word_count || 0), 0);
  const firstName = profile?.username || user?.email?.split('@')[0] || 'bạn';

  return (
    <div>
      <div className="mb-8">
        <p className="text-lg text-zinc-500">Chào mừng trở lại 👋</p>
        <h1 className="text-2xl font-bold text-zinc-900">{firstName}</h1>
      </div>

      {/* Thống kê nhanh */}
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <p className="text-sm text-zinc-500">Bộ từ</p>
          <p className="mt-1 text-3xl font-bold text-zinc-900">{sets.length}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <p className="text-sm text-zinc-500">Từ vựng</p>
          <p className="mt-1 text-3xl font-bold text-zinc-900">{totalWords}</p>
        </div>
<div className="rounded-xl border border-indigo-600 bg-indigo-600 p-5 text-white">
          <p className="text-sm text-indigo-100">Mẹo học</p>
          <p className="mt-1 text-sm font-medium leading-relaxed">
            Luyện tập 10 phút mỗi ngày sẽ giúp bạn nhớ từ lâu hơn.
          </p>
        </div>
      </div>

      {/* SRS Panel */}
      <div className="mb-8 rounded-xl border border-zinc-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-900">Ôn tập (SRS)</h2>
          <Link
            to="/review"
            className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
          >
            Xem chi tiết
          </Link>
        </div>

        {srsLoading ? (
          <div className="flex items-center justify-center py-6">
            <Spinner />
          </div>
        ) : srsError ? (
          <div className="text-sm text-red-600">Không thể tải số liệu ôn tập.</div>
        ) : srsStats ? (
          <div>
            <div className="mb-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-zinc-100 px-4 py-3">
                <p className="text-xs text-zinc-500">Đến hạn</p>
                <p className="mt-1 text-2xl font-bold text-zinc-900">{srsStats.due}</p>
              </div>
              <div className="rounded-lg border border-zinc-100 px-4 py-3">
                <p className="text-xs text-zinc-500">Mới</p>
                <p className="mt-1 text-2xl font-bold text-zinc-900">{srsStats.new}</p>
              </div>
              <div className="rounded-lg border border-zinc-100 px-4 py-3">
                <p className="text-xs text-zinc-500">Đang học</p>
                <p className="mt-1 text-2xl font-bold text-zinc-900">{srsStats.learning}</p>
              </div>
            </div>

            <div className="mb-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-zinc-100 px-4 py-3">
                <p className="text-xs text-zinc-500">Relearning</p>
                <p className="mt-1 text-2xl font-bold text-zinc-900">{srsStats.relearning}</p>
              </div>
              <div className="rounded-lg border border-zinc-100 px-4 py-3">
                <p className="text-xs text-zinc-500">Review</p>
                <p className="mt-1 text-2xl font-bold text-zinc-900">{srsStats.review}</p>
              </div>
              <div className="flex items-center justify-center">
                <Link
                  to="/review"
                  className={`inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700`}
                >
                  {srsStats.due > 0 ? `Bắt đầu ôn tập · ${srsStats.due}` : 'Bắt đầu ôn tập'}
                </Link>
              </div>
            </div>

            {/* If no due cards, show success + next due info */}
            {srsStats.due === 0 ? (
              <div className="rounded-lg border border-zinc-50 bg-green-50 px-4 py-3">
                <p className="text-sm text-green-700">Bạn đã hoàn thành ôn tập hôm nay 🎉</p>
                {srsStats.nextDueAt ? (
                  <p className="mt-2 text-sm text-zinc-700">Thẻ tiếp theo: {formatReviewDue(srsStats.nextDueAt, 0)}</p>
                ) : (
                  <p className="mt-2 text-sm text-zinc-500">Không có thẻ tiếp theo đang lên lịch.</p>
                )}
              </div>
            ) : (
              // Show next due card summary when there are due cards or in general
              srsStats.nextDueAt && (
                <div className="mt-4 rounded-lg border border-zinc-100 px-4 py-3">
                  <p className="text-xs text-zinc-500">Thẻ tiếp theo (tương lai)</p>
                  <p className="mt-1 text-sm text-zinc-700">{srsStats.nextState || '—'}</p>
                  <p className="mt-1 text-sm text-zinc-700">{srsStats.nextIntervalHours ? `Interval: ${srsStats.nextIntervalHours} giờ` : ''}</p>
                  <p className="mt-1 text-sm text-zinc-500">{srsStats.nextDueAt ? new Date(srsStats.nextDueAt).toLocaleString() : ''}</p>
                </div>
              )
            )}
          </div>
        ) : (
          <div className="text-sm text-zinc-500">Không có dữ liệu ôn tập.</div>
        )}
      </div>

      {/* Thống kê theo cấp độ CEFR */}
      {cefrStats && cefrStats.total > 0 && (
        <div className="mb-8 rounded-xl border border-zinc-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-zinc-900">Phân bố cấp độ CEFR</h2>
            <span className="text-sm text-zinc-500">{cefrStats.total} từ</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {CEFR_ORDER.map((level) => {
              const count = cefrStats[level] ?? 0;
              const pct = cefrStats.total ? Math.round((count / cefrStats.total) * 100) : 0;
              return (
                <div key={level} className="flex items-center gap-2 rounded-lg border border-zinc-100 px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cefrBadgeClass(level === 'UNKNOWN' ? null : level)}`}>
                    {level === 'UNKNOWN' ? 'Chưa xác định' : level}
                  </span>
                  <span className="text-sm font-semibold text-zinc-900">{count}</span>
                  <span className="text-xs text-zinc-400">({pct}%)</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-900">Bắt đầu học</h2>
        <Link to="/vocabulary" className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
          Xem tất cả
        </Link>
      </div>

      {loading ? (
        <Spinner />
      ) : sets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-10 text-center">
          <p className="text-zinc-600">Bạn chưa có bộ từ vựng nào.</p>
          <div className="mt-4">
            <Link
              to="/vocabulary"
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              <span aria-hidden="true">+</span> Tạo bộ từ đầu tiên
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sets.slice(0, 6).map((set) => (
            <div
              key={set.id}
              className="flex flex-col rounded-xl border border-zinc-200 bg-white p-5"
            >
              <Link
                to={`/vocabulary/${set.id}`}
                className="text-base font-semibold text-zinc-900 hover:text-indigo-600"
              >
                {set.name}
              </Link>
              {set.description && (
                <p className="mt-1 line-clamp-2 text-sm text-zinc-500">{set.description}</p>
              )}
              <p className="mt-2 text-xs text-zinc-500">{set.word_count || 0} từ</p>
              <div className="mt-3 flex gap-2">
                <Link
                  to={`/practice/typing/${set.id}`}
                  className="flex-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-center text-sm font-medium text-white hover:bg-indigo-700"
                >
                  Gõ từ
                </Link>
                <Link
                  to={`/practice/flashcard/${set.id}`}
                  className="flex-1 rounded-lg border border-zinc-300 px-3 py-1.5 text-center text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Flashcard
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
