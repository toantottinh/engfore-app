import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { getGrammarTopics } from '../../services/grammar.service.js';
import { CEFR_LEVELS, cefrBadgeClass, cefrLabel } from '../../utils/cefr.js';
import Spinner from '../../components/ui/Spinner.jsx';
import Alert from '../../components/ui/Alert.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';

/**
 * GRAMMAR LIBRARY (/grammar) — thư viện kiến thức ngữ pháp.
 *
 * Grammar chỉ là CONTENT LIBRARY giống Vocabulary/Structures:
 *   - Hiển thị topics NHÓM THEO CEFR (A1 → C2, "Chưa xác định" cuối).
 *   - Mỗi card: title, description, số kiến thức (rules), [Xem] → topic detail.
 *   - KHÔNG hiển thị per-user SRS progress ở đây (thuộc /learn — single
 *     source of truth; xem LearnStructures grammar section).
 * Trang chỉ ĐỌC — mọi ghi SRS diễn ra qua phiên học trong /learn flow.
 */
export default function Grammar() {
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      const { data, error: err } = await getGrammarTopics();
      if (!active) return;
      if (err) {
        if (import.meta.env.DEV) {
          console.error('[Grammar] load error:', err);
        }
        setError('Không tải được thư viện ngữ pháp. Vui lòng thử lại.');
        setTopics([]);
      } else {
        setTopics(data || []);
      }
      setLoading(false);
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  // Nhóm theo CEFR (thứ tự A1..C2, topics không có CEFR về cuối).
  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = (topics || []).filter((t) => {
      if (!q) return true;
      return [t.title, t.description, t.category]
        .map((v) => String(v || '').toLowerCase())
        .some((v) => v.includes(q));
    });

    const byCefr = {};
    filtered.forEach((t) => {
      const key = CEFR_LEVELS.includes(t.cefr) ? t.cefr : 'unknown';
      (byCefr[key] = byCefr[key] || []).push(t);
    });

    const ordered = CEFR_LEVELS.map((level) => ({
      cefr: level,
      items: byCefr[level] || [],
    }));
    if (byCefr.unknown?.length) {
      ordered.push({ cefr: 'unknown', items: byCefr.unknown });
    }
    return ordered.filter((g) => g.items.length > 0);
  }, [topics, search]);

  const totalRules = (topics || []).reduce((sum, t) => sum + (t.rule_count || 0), 0);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Ngữ pháp</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Kiến thức ngữ pháp được chia thành các topic nhỏ — mỗi kiến thức có thể
          luyện tập độc lập và tham gia học ngắt quãng trong khu Học.
        </p>
        {!loading && !error && (
          <p className="mt-2 text-xs text-text-secondary">
            {topics.length} topic · {totalRules} kiến thức
          </p>
        )}
      </div>

      {/* Tìm kiếm đơn giản theo title/description/category */}
      {!loading && !error && topics.length > 0 && (
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm topic ngữ pháp..."
          aria-label="Tìm topic ngữ pháp"
          className="w-full max-w-md rounded-lg border border-border-color bg-surface-sidebar px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary"
        />
      )}

      {loading && (
        <div className="flex justify-center py-12" role="status">
          <Spinner />
        </div>
      )}

      {error && (
        <div className="space-y-2">
          <Alert type="error" message={error} />
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="text-sm font-medium text-brand-primary underline underline-offset-2"
          >
            Thử lại
          </button>
        </div>
      )}

      {!loading && !error && topics.length === 0 && (
        <EmptyState
          icon="📐"
          title="Chưa có nội dung ngữ pháp."
          description="Quản trị viên sẽ bổ sung các topic ngữ pháp để bạn bắt đầu học."
        />
      )}

      {!loading &&
        !error &&
        groups.map(({ cefr, items }) => (
          <section key={cefr} aria-label={cefrLabel(cefr)}>
            <div className="mb-3 flex items-center gap-2">
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${cefrBadgeClass(cefr)}`}
              >
                {cefrLabel(cefr)}
              </span>
              {cefr === 'A1' && (
                <span className="text-xs font-medium uppercase tracking-wide text-text-secondary">
                  — Cơ bản
                </span>
              )}
              <span className="text-xs text-text-secondary">({items.length})</span>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {items.map((t) => (
                <div
                  key={t.id}
                  className="flex flex-col rounded-xl border border-border-color bg-surface-sidebar p-5 transition-shadow hover:shadow-lg"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-semibold text-text-primary">{t.title}</h3>
                    <span
                      className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${cefrBadgeClass(t.cefr)}`}
                    >
                      {cefrLabel(t.cefr)}
                    </span>
                  </div>
                  {t.description && (
                    <p className="mt-2 text-sm text-text-secondary">{t.description}</p>
                  )}
                  <div className="mt-3 flex flex-1 items-end justify-between gap-3">
                    <span className="text-xs text-text-secondary/70">
                      {t.rule_count} kiến thức
                    </span>
                    <Link
                      to={`/grammar/${t.id}`}
                      className="rounded-lg border border-brand-primary px-3 py-1.5 text-sm font-medium text-brand-primary transition-colors hover:bg-brand-primary-soft"
                    >
                      Xem
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
    </div>
  );
}