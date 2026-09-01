import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { useGrammarSession } from '../../hooks/useGrammarSession.js';
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
 * Grammar Learning Session (/grammar/session/:ruleId).
 *
 * Mỗi lần Grammar Rule đến lượt (từ "Học" trên rule/topic hoặc queue SRS):
 *   Rule -> kế hoạch exercise THEO SRS STATE (resolveGrammarExercisePlan =
 *           resolveStructureExercisePlan — generic trên (progress, bank))):
 *     NEW / AGAIN  : sequence tối đa 6 bài theo thứ tự ổn định, xong bài này
 *                       mới sang bài kế, rating CHỈ sau bài cuối.
 *     review + last_rating AGAIN/HARD/không rõ : RANDOM ĐÚNG 1 exercise guided.
 *     review + last_rating GOOD/EASY           : RANDOM 1 bài PURE TEST.


 *
 * Rule/Explanation KHÔNG bị lộ trước khi user trả lời (mirror Structure V2) — chỉ
 * sau feedback panel mới REVEAL kiến thức (đổi nhãn qua revealLabel="Kiến thức").
 * tiến trình SRS được ghi ĐÚNG MỘT LẦN bằng recordGrammarResult -> computeSrsPayload:


 * (dùng chung scheduler với Vocabulary/Structure — một SRS engine cho EngFore).


 *
 * KHÔNG có "rule kế tiếp" trong cùng session: một lần gặp = một exercise set=
 * = một rating. Sau rating session kết thúc; quay lại rule detail / thư viện.


 *
 */

export default function GrammarSession() {
  const h = useGrammarSession(useParams().ruleId);

  if (h.loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (h.error || !h.rule) {
    return (
      <div className="py-8">
        <Alert type="error" message={h.error || 'Không tìm thấy kiến thức ngữ pháp để học.'} />
        <div className="mt-4">
          <Link to="/grammar">
            <Button variant="secondary">← Về thư viện ngữ pháp</Button>
          </Link>
        </div>
      </div>
    );
  }
const r = h.rule;

  // ===== INTRO =====
  // KHÔNG hiển thị rule/explanation trước khi user trả lời (sẽ lộ kiến thức/đáp án).
  // Copy đổi theo encounter mode:
  //   NEW/AGAIN (sequence) -> giới thiệu số bài & quy tắc làm tuần tự đến hết;
  //   đã tốt nghiệp -> giữ nguyên mô tả 1 bài ngẫu nhiên như trước.



  if (h.phase === 'intro') {

    const isSequence = h.planMode === 'sequence';
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <Link to={`/grammar/rule/${r.id}`} className="text-sm text-brand-primary hover:underline">
          ← Chi tiết kiến thức
        </Link>
        <div className="rounded-xl border border-border-color bg-surface-sidebar p-6">
          <h1 className="text-2xl font-bold text-text-primary">
            {isSequence ? 'Học kiến thức này' : 'Kiểm tra kiến thức của bạn'}
          </h1>
          {isSequence ? (
            <>
              <p className="mt-3 text-sm text-text-secondary">
                Rule này đang ở bước học/luyện lại: bạn sẽ làm{' '}
                <span className="font-medium text-text-primary">{h.exerciseCount} bài tập</span>{' '}
                lần lượt{' '}
                <span className="font-medium text-text-primary">theo đúng thứ tự</span>
                . Rule và giải thích được hiển thị{' '}
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
                {h.exerciseCount > 0 && <> chọn từ {h.exerciseCount} bài của rule này</>}. Rule và
                giải thích chỉ được hiển thị{' '}
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
            Chưa có bài tập cho kiến thức này.
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            Quay lại sau khi bài tập được import cho &quot;{r.title}&quot;.
          </p>
        </div>
        <div className="flex items-center justify-center gap-3">
          <Link to="/grammar">
            <Button variant="secondary">← Về thư viện ngữ pháp</Button>
          </Link>
          <Link to={`/grammar/rule/${r.id}`}>
            <Button variant="ghost">Chi tiết kiến thức</Button>
          </Link>
        </div>
      </div>
    );
  }
// ===== EXERCISE =====
  // Góc TRÊN BÊN PHẢI luôn hiển thị RULE đang luyện (r.title) — yêu cầu


  // product: người học biết kiến thức cần dùng trong khi làm bài.(Không lộ
  // rule/explanation full — CHỈ sau feedback.
  if (h.phase === 'exercise') {

    const ex = h.currentExercise;
    const inSequence = h.planMode === 'sequence' && h.sequenceTotal > 0;
    return (
      <div className="mx-auto max-w-2xl space-y-3">
        <div className="flex items-start justify-between gap-3">
          {inSequence ? (
            <span
              className="shrink-0 text-sm font-semibold text-text-primary"
              data-testid="grammar-sequence-progress"
            >
              Bài {h.sequenceIndex + 1}/{h.sequenceTotal}
            </span>
          ) : (
            <span className="shrink-0 text-sm text-text-secondary">🎲 Một bài tập ngẫu nhiên</span>
          )}
          {/* Rule đang học — không hard-code, lấy từ rule hiện tại */}
          <span
            data-testid="grammar-session-title"
            title={r.title}
            className="min-w-0 truncate rounded-lg bg-surface-sidebar px-2 py-1 text-right text-sm font-semibold text-brand-primary"
          >
            {r.title}
          </span>
        </div>
        <div className="rounded-xl border border-border-color bg-surface p-5">
          {h.feedback?.submitted ? (
            <FeedbackView
              exercise={ex}
              feedback={h.feedback}
              structure={r}
              onNext={h.proceedAfterFeedback}
              revealStructure={h.revealRule}
              revealLabel="Kiến thức"
            />
          ) : (
            <ExerciseRenderer exercise={ex} feedback={h.feedback} onSubmit={h.submitAnswer} />
          )}
        </div>
        {inSequence && !h.feedback?.submitted && (
          <p className="text-xs text-text-secondary">
            Làm xong hết các bài bạn sẽ tự đánh giá mức độ nhớ:{' '}
            Again / Hard / Good / Easy.
          </p>
        )}
      </div>
    );
  }

  // ===== RATING =====
  // Exercise correctness KHÔNG tự thành SRS rating — user tự đánh giá Rule.


  if (h.phase === 'rating') {

    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="rounded-xl border border-border-color bg-surface p-5 text-center">
          <p className="text-lg font-semibold text-text-primary">{r.title}</p>
          <p className="mt-1 text-sm text-text-secondary">Bạn nhớ kiến thức này thế nào?</p>

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
  // Một lần SRS occurrence = một exercise set = một rating. Session KẾT THÚC
  // ở đây — KHÔNG có "rule kế tiếp" trong cùng session.


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
            <Link to={`/grammar/rule/${r.id}`}>
              <Button>Về kiến thức này</Button>
            </Link>
            <Link to="/grammar">
              <Button variant="secondary">Về thư viện ngữ pháp</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
