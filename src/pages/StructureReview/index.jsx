import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useStructureReviewSession } from '../../hooks/useStructureReviewSession.js';
import {
  ExerciseRenderer,
  FeedbackView,
  RATING_BUTTONS,
  formatIntervalPreview,
} from '../../components/StructureExerciseParts.jsx';
import Button from '../../components/ui/Button.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import Alert from '../../components/ui/Alert.jsx';

/**
 * CK10 — STRUCTURE REVIEW SESSION (/learn/structures/session).
 *
 * Giống Vocabulary Review: user KHÔNG chọn structure — system tự chọn theo
 * queue DUE → LEARNING → NEW, mỗi structure làm ĐÚNG 1 random exercise,
 * rating xong TỰ ĐỘNG sang structure kế tiếp cho đến khi hết phiên.
 *
 * Neutral recall: trong lúc trả lời KHÔNG hiển thị pattern/meaning/explanation.
 * Error-driven learning: sau submit mới reveal Structure + giải thích.
 */
export default function StructureReview() {
  const h = useStructureReviewSession();

  // ------------------------------------------------------------------
  // Phím tắt Enter / Space = nút "Tiếp tục".
  //
  // Điều kiện kích hoạt (đúng spec):
  //   1. Đang ở màn Ôn tập cấu trúc (component này).
  //   2. Câu hỏi đã trả lời & kết quả đang hiển thị
  //      (phase === 'exercise' && feedback.submitted — lúc đó FeedbackView
  //       cùng nút "Tiếp tục" mới được render).
  //   3. Nút khả dụng — proceedAfterFeedback() chính là handler của nút,
  //      được reuse trực tiếp (KHÔNG tạo flow Next riêng), đồng thời nó
  //      idempotent (setPhase guarded) nên nhấn lặp cũng an toàn.
  //
  // Không xung đột input: nếu focus nằm trong input/textarea/select hoặc
  // phần tử contenteditable thì bỏ qua — đặc biệt giữ nguyên dấu cách (Space)
  // khi người dùng đang gõ câu trả lời.
  //
  // preventDefault CHỈ gọi khi phím tắt thực sự kích hoạt (chặn scroll trang
  // cho Space). Listener được cleanup khi unmount/khi điều kiện đổi.
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!(h.phase === 'exercise' && h.feedback?.submitted)) return undefined;

    const isEditableTarget = (el) => {
      if (!el || !el.tagName) return false;
      const tag = el.tagName.toLowerCase();
      if (
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select'
      ) {
        return true;
      }
      // contenteditable: kiểm tra CẢ API (isContentEditable) lẫn attribute
      // [contenteditable="true"] (kể cả tổ tiên) — một số môi trường (vd jsdom)
      // không implement isContentEditable.
      if (el.isContentEditable) return true;
      return (
        typeof el.closest === 'function' &&
        el.closest('[contenteditable="true"]') != null
      );
    };

    const handleKey = (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
      h.proceedAfterFeedback();
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [h.phase, h.feedback, h.proceedAfterFeedback]);

  // ===== LOADING / ADVANCING =====
  if (h.phase === 'loading' || h.phase === 'advancing') {
    return (
      <div className="mx-auto max-w-2xl space-y-3 py-16 text-center">
        <div className="flex justify-center" role="status">
          <Spinner />
        </div>
        <p className="text-sm text-text-secondary">
          {h.phase === 'advancing' ? 'Đang chuyển sang cấu trúc tiếp theo…' : 'Đang tải phiên ôn…'}
        </p>
      </div>
    );
  }

  // ===== COMPLETE =====
  if (h.phase === 'complete') {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="rounded-xl border border-border-color bg-surface-sidebar p-6 text-center">
          <p className="text-lg font-semibold text-text-primary">🎉 Hoàn thành!</p>
          {h.error ? (
            <p className="mt-2 text-sm text-danger">{h.error}</p>
          ) : (
            <p className="mt-2 text-sm text-text-secondary">
              {h.completedMessage || 'Bạn đã hoàn thành phiên học cấu trúc.'}
            </p>
          )}
          {h.lastResult?.review_due_at && (
            <p className="mt-2 text-sm text-text-secondary">
              Lịch ôn gần nhất:{' '}
              <span className="font-semibold text-brand-primary">
                {formatIntervalPreview(h.lastResult.review_due_at)}
              </span>
            </p>
          )}
          {h.skippedCount > 0 && (
            <p className="mt-1 text-xs text-text-secondary">
              (Đã bỏ qua {h.skippedCount} cấu trúc chưa có bài tập.)
            </p>
          )}
          <div className="mt-5 flex items-center justify-center gap-3">
            {!h.error && (
              <Button onClick={h.restart}>Học tiếp</Button>
            )}
            <Link to="/learn/structures">
              <Button variant="secondary">Quay lại</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const s = h.current?.structure;
  const ex = h.current?.exercise;
  if (!s || !ex) return null;

  // ===== EXERCISE (neutral recall — không lộ structure) =====
  if (h.phase === 'exercise') {
    return (
      <div className="mx-auto max-w-2xl space-y-3">
        <div className="flex items-center justify-between text-xs text-text-secondary">
          <span>Ôn tập cấu trúc</span>
          <span>
            Cấu trúc {h.position + 1}/{h.totalCount}
          </span>
        </div>
        <div className="rounded-xl border border-border-color bg-surface p-5">
          {h.feedback?.submitted ? (
            <FeedbackView
              exercise={ex}
              feedback={h.feedback}
              structure={s}
              onNext={h.proceedAfterFeedback}
            />
          ) : (
            <ExerciseRenderer exercise={ex} feedback={h.feedback} onSubmit={h.submitAnswer} />
          )}
        </div>
      </div>
    );
  }

  // ===== RATING =====
  if (h.phase === 'rating') {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="rounded-xl border border-border-color bg-surface p-5 text-center">
          <p className="text-lg font-semibold text-text-primary">{s.pattern}</p>
          <p className="mt-1 text-sm text-text-secondary">Bạn nhớ cấu trúc này thế nào?</p>

          {h.ratingError && (
            <div className="mt-3">
              <Alert type="error" message={h.ratingError} />
            </div>
          )}

          {h.isRating ? (
            <div className="mt-4 flex justify-center" role="status">
              <Spinner />
            </div>
          ) : (
            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {RATING_BUTTONS.map((btn) => (
                <button
                  key={btn.key}
                  type="button"
                  onClick={() => h.handleRating(btn.key)}
                  disabled={h.isRating}
                  className={`flex flex-col items-center rounded-xl border px-2 py-2.5 text-sm font-medium shadow-sm transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 ${btn.btnCls}`}
                >
                  <span className="text-sm font-semibold">{btn.label}</span>
                  {h.previewIntervals[btn.key] && (
                    <span className="mt-0.5 text-xs opacity-80">
                      {formatIntervalPreview(h.previewIntervals[btn.key])}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
        <p className="text-center text-xs text-text-secondary">
          Chấm xong hệ thống tự chuyển sang cấu trúc kế tiếp.
        </p>
      </div>
    );
  }

  return null;
}
