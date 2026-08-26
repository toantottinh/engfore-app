import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { useStructureSession } from '../../hooks/useStructureSession.js';
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
 * Structure Learning Session (CHECKPOINT 8 + V2).
 *
 * Mỗi lần Structure đến lượt (từ SRS queue /learn/structures hoặc học thủ công):
 *   Structure -> RANDOM ĐÚNG 1 exercise -> answer -> feedback
 *             -> user tự đánh giá Again/Hard/Good/Easy -> 1 SRS update.
 *
 * KHÔNG còn progression "Bài 1/N" — một phiên = một exercise = một rating.
 * KHÔNG lộ pattern/meaning/explanation trước khi user trả lời (V2).
 * Sau rating session kết thúc; quay lại queue bằng link (queue reload on mount).
 */

export default function StructureSession() {
  const h = useStructureSession(useParams().structureId);

  if (h.loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (h.error || !h.structure) {
    return (
      <div className="py-8">
        <Alert type="error" message={h.error || 'Không tìm thấy cấu trúc để học.'} />
        <div className="mt-4">
          <Link to="/structures">
            <Button variant="secondary">← Về thư viện</Button>
          </Link>
        </div>
      </div>
    );
  }

  const s = h.structure;

  // ===== INTRO =====
  // DAILY RECALL TEST — KHÔNG hiển thị pattern/meaning/explanation/examples
  // trước khi user trả lời (sẽ lộ công thức/đáp án). Màn hình khởi động trung tính.
  // Copy đổi theo encounter mode:
  //   NEW/AGAIN (sequence) -> giới thiệu số bài & quy tắc làm tuần tự đến hết;
  //   đã tốt nghiệp -> giữ nguyên mô tả 1 bài ngẫu nhiên như trước.
  if (h.phase === 'intro') {
    const isSequence = h.planMode === 'sequence';
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <Link to={`/structures/${s.id}`} className="text-sm text-brand-primary hover:underline">
          ← Chi tiết cấu trúc
        </Link>
        <div className="rounded-xl border border-border-color bg-surface-sidebar p-6">
          <h1 className="text-2xl font-bold text-text-primary">
            {isSequence ? 'Học cấu trúc này' : 'Kiểm tra cấu trúc của bạn'}
          </h1>
          {isSequence ? (
            <>
              <p className="mt-3 text-sm text-text-secondary">
                Cấu trúc này đang ở bước học/luyện lại: bạn sẽ làm{' '}
                <span className="font-medium text-text-primary">{h.exerciseCount} bài tập</span>{' '}
                lần lượt{' '}
                <span className="font-medium text-text-primary">theo đúng thứ tự</span>
                . Cấu trúc, nghĩa và giải thích được hiển thị{' '}
                <span className="font-medium text-text-primary">sau mỗi bài trả lời</span> để bạn
                nắm chắc hơn.
              </p>
              <p className="mt-2 text-sm text-text-secondary">
                Làm xong hết bài cuối bạn sẽ tự đánh giá mức độ nhớ:{' '}
                <span className="font-medium text-text-primary">Again / Hard / Good / Easy</span>.
                Không thể chấm điểm giữa chừng.
              </p>
            </>
          ) : (
            <>
              <p className="mt-3 text-sm text-text-secondary">
                Đây là bài ôn hằng ngày: bạn sẽ nhận{' '}
                <span className="font-medium text-text-primary">một bài tập ngẫu nhiên</span>
                {h.exerciseCount > 0 && <> chọn từ {h.exerciseCount} bài của cấu trúc này</>}. Cấu
                trúc, nghĩa và giải thích chỉ được hiển thị{' '}
                <span className="font-medium text-text-primary">sau khi bạn trả lời</span>.
              </p>
              <p className="mt-2 text-sm text-text-secondary">
                Trả lời xong bạn sẽ tự đánh giá mức độ nhớ: Again / Hard / Good / Easy.
              </p>
            </>
          )}
          <div className="mt-6">
            <Button onClick={h.startSession} size="lg">
              Bắt đầu
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ===== NO EXERCISES =====
  // Bank rỗng: KHÔNG random, KHÔNG rating, KHÔNG ghi SRS chỉ vì mở session.
  if (h.phase === 'no-exercises') {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="rounded-xl border border-dashed border-border-color bg-surface-sidebar p-6 text-center">
          <p className="text-base font-medium text-text-primary">
            Chưa có bài tập cho cấu trúc này.
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            Quay lại sau khi bài tập được import cho &quot;{s.pattern}&quot;.
          </p>
        </div>
        <div className="flex items-center justify-center gap-3">
          <Link to="/learn/structures">
            <Button variant="secondary">← Về hàng đợi học</Button>
          </Link>
          <Link to={`/structures/${s.id}`}>
            <Button variant="ghost">Chi tiết cấu trúc</Button>
          </Link>
        </div>
      </div>
    );
  }

  // ===== EXERCISE =====
  // Header KHÔNG hiển thị pattern/structure — tránh lộ công thức/đáp án
  // trước khi user submit (daily recall test).
  // NEW/AGAIN (sequence): progress "Bài x/n" rõ ràng; vẫn ĐÚNG MỘT exercise
  // render tại một thời điểm — bài kế tiếp xuất hiện sau khi feedback được
  // "Tiếp tục", KHÔNG bao giờ kèm rating giữa chừng.
  if (h.phase === 'exercise') {
    const ex = h.currentExercise;
    const inSequence = h.planMode === 'sequence' && h.sequenceTotal > 0;
    return (
      <div className="mx-auto max-w-2xl space-y-3">
        {inSequence ? (
          <div className="flex items-center justify-between text-sm text-text-secondary">
            <span
              className="font-semibold text-text-primary"
              data-testid="structure-sequence-progress"
            >
              Bài {h.sequenceIndex + 1}/{h.sequenceTotal}
            </span>
            <span>Làm xong hết mới chấm Again/Hard/Good/Easy</span>
          </div>
        ) : (
          <div className="text-sm text-text-secondary">🎲 Một bài tập ngẫu nhiên</div>
        )}
        <div className="rounded-xl border border-border-color bg-surface p-5">
          {h.feedback?.submitted ? (
            <FeedbackView
              exercise={ex}
              feedback={h.feedback}
              structure={s}
              onNext={h.proceedAfterFeedback}
              revealStructure={h.revealStructure}
            />
          ) : (
            <ExerciseRenderer exercise={ex} feedback={h.feedback} onSubmit={h.submitAnswer} />
          )}
        </div>
      </div>
    );
  }

  // ===== RATING =====
  // Exercise correctness KHÔNG tự thành SRS rating — user tự đánh giá Structure.
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
      </div>
    );
  }

  // ===== COMPLETE =====
  // Một lần SRS occurrence = một exercise = một rating. Session KẾT THÚC ở đây
  // — KHÔNG có "cấu trúc tiếp theo" trong cùng session. Queue reload khi user
  // quay lại /learn/structures (hook load-on-mount).
  if (h.phase === 'complete') {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="rounded-xl border border-border-color bg-surface-sidebar p-5 text-center">
          <p className="text-lg font-semibold text-text-primary">Đã lưu tiến trình!</p>
          {h.lastReviewResult?.review_due_at && (
            <p className="mt-2 text-sm text-text-secondary">
              Lịch ôn tập tiếp theo:{' '}
              <span className="font-semibold text-brand-primary">
                {formatIntervalPreview(h.lastReviewResult.review_due_at)}
              </span>
            </p>
          )}
          <div className="mt-4 flex items-center justify-center gap-3">
            <Link to="/learn/structures">
              <Button>Về hàng đợi học cấu trúc</Button>
            </Link>
            <Link to="/structures">
              <Button variant="secondary">Về thư viện</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return null;
}





