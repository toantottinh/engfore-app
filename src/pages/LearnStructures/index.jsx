import React from 'react';
import { Link } from 'react-router-dom';
import { useStructureLearnQueue } from '../../hooks/useStructureLearnQueue.js';
import { structureSessionPath } from '../../utils/structure-status.js';
import { cefrBadgeClass, cefrLabel } from '../../utils/cefr.js';
import Spinner from '../../components/ui/Spinner.jsx';
import Alert from '../../components/ui/Alert.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';

/**
 * CK7 — STRUCTURE SRS QUEUE trong khu học ngắt quãng (/learn).
 *
 * HỌC NGẮT QUÃNG
 *   DUE       → Đến hạn ôn (state='review' && review_due_at<=now)
 *   LEARNING  → Đang học   (state='learning' | 'relearning')
 *   NEW       → Mới        (chưa có user_structures hoặc state='new')
 *
 * Mỗi item được định danh bằng structureId (UUID). Click item điều hướng tới
 * Structure Learning Session (/structures/session/:structureId) — flow hiện
 * có, KHÔNG đổi behavior của Vocabulary hay của session.
 *
 * Daily NEW limit: codebase chưa có chính sách daily_new_limit cho Structure
 * nên queue hiển thị ĐỦ ba nhóm theo đúng scheduler user_structures — không
 * hard-code limit mới ở UI layer.
 */

// Nhóm hiển thị: key khớp partitionStructureQueue; dot màu theo convention
// StatusCounts (Mới / Again-learning / Ôn).
const SECTIONS = [
  {
    key: 'due',
    title: 'Đến hạn ôn',
    dot: 'bg-danger',
    emptyText: 'Không có cấu trúc nào đến hạn ôn.',
  },
  {
    key: 'learning',
    title: 'Đang học',
    dot: 'bg-warning',
    emptyText: 'Không có cấu trúc nào đang trong learning steps.',
  },
  {
    key: 'new',
    title: 'Mới',
    dot: 'bg-success',
    emptyText: 'Không còn cấu trúc mới trong thư viện.',
  },
];

function formatDueLabel(iso) {
  if (!iso) return '';
  const diff = Date.parse(iso) - Date.now();
  if (Number.isNaN(diff)) return '';
  if (diff <= 0) return 'Đến hạn ngay bây giờ';
  const minutes = Math.round(diff / (1000 * 60));
  if (minutes < 60) return `Hẹn sau ${minutes} phút`;
  const hours = Math.round(diff / (1000 * 60 * 60));
  const days = Math.round(diff / (1000 * 60 * 60 * 24));
  return `Hẹn sau ${days} ngày`;
}

// Một hàng queue — identity là structureId; pattern/meaning CHỈ để hiển thị.
function QueueItem({ item, sectionKey }) {
  const prog = item.user_structures || null;
  return (
    <Link
      to={structureSessionPath(item.structureId ?? item.id)}
      data-testid={`structure-queue-item-${item.structureId ?? item.id}`}
      className="block rounded-xl border border-border-color bg-surface-sidebar px-4 py-3 transition-colors hover:bg-surface-hover"
      aria-label={`Học cấu trúc ${item.pattern || ''}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-text-primary">{item.pattern}</p>
          {item.meaning && (
            <p className="mt-0.5 truncate text-xs text-text-secondary">{item.meaning}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {item.cefr && (
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${cefrBadgeClass(item.cefr)}`}
            >
              {cefrLabel(item.cefr)}
            </span>
          )}
          {sectionKey === 'due' && (
            <span className="text-[11px] font-medium text-danger">
              {formatDueLabel(prog?.review_due_at)}
            </span>
          )}
          {sectionKey === 'learning' && (
            <span className="text-[11px] font-medium text-text-secondary">
              Bước {Number(prog?.learning_step ?? 0) + 1}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

export default function LearnStructures() {
  const { sections, stats, loading, error, reload } = useStructureLearnQueue();
  const isEmpty =
    !loading && !error &&
    sections.due.length + sections.learning.length + sections.new.length === 0;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* CK10 — CTA mở Review Session TỰ ĐỘNG (không chọn structure thủ công).
          Queue vẫn ở đây để xem tiến độ; review chính là flow này. */}
      {!loading && !error && stats?.total > 0 && (
        <Link
          to="/learn/structures/session"
          data-testid="start-structure-review"
          className="flex items-center justify-between rounded-xl bg-brand-primary px-5 py-4 text-white shadow-sm transition-colors hover:bg-brand-primary-hover"
        >
          <span>
            <span className="block text-base font-semibold">Học cấu trúc ngắt quãng</span>
            <span className="block text-xs opacity-90">
              Hệ thống tự chọn cấu trúc đến lượt — bạn trả lời rồi tự đánh giá.
            </span>
          </span>
          <span aria-hidden="true" className="text-xl">
            →
          </span>
        </Link>
      )}

      {/* Bộ đếm tổng từ getStructureSrsStats (non-fatal nếu chưa tải được) */}
      {!loading && !error && stats && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xl border border-border-color bg-surface-sidebar px-4 py-3 text-sm text-text-secondary">
          <span>
            Tổng: <strong className="text-text-primary">{stats.total}</strong>
          </span>
          <span>
            Đến hạn: <strong className="text-danger">{stats.due}</strong>
          </span>
          <span>
            Đang học: <strong className="text-text-primary">{stats.again}</strong>
          </span>
          <span>
            Mới: <strong className="text-success">{stats.new}</strong>
          </span>
        </div>
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
            onClick={reload}
            className="text-sm font-medium text-brand-primary underline underline-offset-2"
          >
            Thử lại
          </button>
        </div>
      )}

      {isEmpty && (
        <EmptyState
          icon="🏗️"
          title="Chưa có cấu trúc nào để học"
          description="Mở thư viện Sentence Structures để xem các cấu trúc câu."
          action={
            <Link
              to="/structures"
              className="text-sm font-medium text-brand-primary underline underline-offset-2"
            >
              Đi tới thư viện Structures
            </Link>
          }
        />
      )}

      {!loading &&
        !error &&
        SECTIONS.map(({ key, title, dot, emptyText }) => {
          const items = sections[key] || [];
          return (
            <section key={key} aria-label={title}>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-text-primary">
                <span className={`inline-block h-2 w-2 rounded-full ${dot}`} aria-hidden="true" />
                {title}
                <span className="text-text-secondary">({items.length})</span>
              </h3>
              {items.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border-color px-4 py-3 text-xs text-text-secondary">
                  {emptyText}
                </p>
              ) : (
                <div className="space-y-2">
                  {items.map((item) => (
                    <QueueItem key={item.structureId ?? item.id} item={item} sectionKey={key} />
                  ))}
                </div>
              )}
            </section>
          );
        })}
    </div>
  );
}
