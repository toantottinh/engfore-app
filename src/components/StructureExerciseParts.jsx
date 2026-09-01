import React, { useState } from 'react';
import Button from './ui/Button.jsx';

// ------------------------------------------------------------------
// Shared parts cho Structure exercise sessions (CK8/V2/CK10):
//   - StructureSession (/structures/session/:structureId) — học thủ công
//   - StructureReview (/learn/structures/session) — review tự động
// ------------------------------------------------------------------

// Định dạng interval preview ngắn ("10 phút", "1 ngày", ...) — giống LearningSession.
export function formatIntervalPreview(iso) {
  if (!iso) return '';
  const diff = Date.parse(iso) - Date.now();
  if (Number.isNaN(diff) || diff <= 0) return 'ngay';
  const minutes = Math.round(diff / (1000 * 60));
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.round(diff / (1000 * 60 * 60));
  if (hours < 48) return `${hours} giờ`;
  const days = Math.round(diff / (1000 * 60 * 60 * 24));
  return `${days} ngày`;
}

export const RATING_BUTTONS = [
  { key: 'again', label: 'Again', btnCls: 'border-danger/30 bg-danger-soft text-danger' },
  { key: 'hard', label: 'Hard', btnCls: 'border-border-color bg-surface-sidebar text-text-primary' },
  { key: 'good', label: 'Good', btnCls: 'border-brand-primary bg-brand-primary-soft text-brand-primary' },
  { key: 'easy', label: 'Easy', btnCls: 'border-success/30 bg-success-soft text-success' },
];

// Render MỘT exercise theo type (6 type V1). Quản lý answer local, gọi onSubmit.
export function ExerciseRenderer({ exercise, feedback, onSubmit }) {
  const [textValue, setTextValue] = useState('');
  const [selected, setSelected] = useState('');
  const [builtTokens, setBuiltTokens] = useState([]);

  const currentAnswer = () => {
    if (exercise.type === 'multiple_choice') return selected;
    if (exercise.type === 'rearrange') return builtTokens.join(' ');
    return textValue;
  };

  const submit = () => {
    if (!currentAnswer().trim() && exercise.type !== 'production') return;
    onSubmit(currentAnswer());
  };

  const rearrangeTokens = String(exercise.question || '')
    .split(';;')
    .map((t) => t.trim())
    .filter(Boolean);

  if (feedback?.submitted) return null; // feedback render bên ngoài

  return (
    <div className="space-y-3">
      <p className="text-base font-medium text-text-primary">{exercise.question}</p>
      {exercise.type === 'multiple_choice' && (
        <>
          <div className="flex flex-col gap-2">
            {(exercise.options || []).map((opt, i) => (
              <label
                key={i}
                className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors ${
                  selected === opt
                    ? 'border-brand-primary bg-brand-primary-soft'
                    : 'border-border-color bg-surface-sidebar'
                }`}
              >
                <input
                  type="radio"
                  name="s-exercise-option"
                  value={opt}
                  checked={selected === opt}
                  onChange={() => setSelected(opt)}
                  className="mt-0.5"
                />
                <span>{opt}</span>
              </label>
            ))}
          </div>
          <Button onClick={submit} disabled={!selected} className="mt-2">
            Kiểm tra
          </Button>
        </>
      )}

      {exercise.type === 'rearrange' && (
        <>
          <p className="-mt-2 text-xs text-text-secondary">Ghép các từ sau thành câu đúng:</p>
          <div className="flex flex-wrap gap-2">
            {rearrangeTokens.map((token, i) => {
              const used = builtTokens.filter((t) => t === token).length;
              const total = rearrangeTokens.filter((t) => t === token).length;
              const disabled = used >= total;
              return (
                <button
                  key={i}
                  type="button"
                  disabled={disabled}
                  onClick={() => setBuiltTokens((prev) => [...prev, token])}
                  className="rounded-lg border border-border-color bg-surface-sidebar px-3 py-1.5 text-sm font-medium disabled:opacity-40"
                >
                  {token}
                </button>
              );
            })}
          </div>
          {builtTokens.length > 0 && (
            <div className="rounded-lg border border-border-color bg-surface p-3 text-sm text-text-primary">
              {builtTokens.join(' ')}
              <button
                type="button"
                onClick={() => setBuiltTokens([])}
                className="ml-3 text-xs text-text-secondary underline"
              >
                Xóa
              </button>
            </div>
          )}
          <Button onClick={submit} disabled={builtTokens.length === 0} className="mt-2">
            Kiểm tra
          </Button>
        </>
      )}

      {exercise.type === 'production' && (
        <>
          {/* Self-check: user viết -> đối chiếu câu mẫu -> tự rating. KHÔNG auto-grade. */}
          <textarea
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            rows={3}
            placeholder="Viết câu của bạn..."
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
          />
          <p className="text-xs text-text-secondary">
            Không tự chấm tự động — viết câu, đối chiếu câu mẫu và tự nhận xét.
          </p>
          <Button onClick={submit} disabled={!textValue.trim()} className="mt-2">
            Tôi đã viết xong
          </Button>
        </>
      )}

      {(exercise.type === 'fill_blank' ||
        exercise.type === 'translation' ||
        exercise.type === 'correction') && (
        <>
          <input
            type="text"
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && textValue.trim()) submit();
            }}
            placeholder="Nhập câu trả lời..."
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
          />
          <Button onClick={submit} disabled={!textValue.trim()} className="mt-2">
            Kiểm tra
          </Button>
        </>
      )}
    </div>
  );
}

// Feedback sau khi submit — EXERCISE V2 (error-driven learning).
// Trước submit: KHÔNG hiển thị structure/đáp án/hint.
// Sau submit: verdict -> câu trả lời của user -> đáp án/reference
//   -> REVEAL knowledge (pattern + meaning + explanation).
//
// `revealStructure` (default true): tắt panel reveal ở các phiên PURE TEST
// (GOOD/EASY — random test không gợi ý). Per-exercise feedback (verdict/đáp án)
// vẫn hiển thị vì đó là kết quả của bài VỪA trả lời, không dẫn dắt đáp án mới.
//
// `revealLabel` (default 'Cấu trúc'): nhãn của panel reveal — Grammar Session
// tái sử dụng component này cho knowledge item của mình (rule) nên đổi nhãn
// thành 'Kiến thức' mà KHÔNG đổi behavior cho Structure Session.
export function FeedbackView({
  exercise,
  feedback,
  structure,
  onNext,
  revealStructure = true,
  revealLabel = 'Cấu trúc',
}) {
  const result = feedback?.result;
  if (!result) return null;

  const userAnswer = String(feedback.userAnswer || '').trim();
  // Ưu tiên explanation của exercise; fallback sang explanation của structure.
  const explanation = result.explanation || structure?.explanation || null;

  return (
    <div className="space-y-3 rounded-xl border border-border-color bg-surface-sidebar p-4">
      {result.selfCheck ? (
        <p className="text-sm font-medium text-text-primary">
          🙌 Đã nhận câu của bạn (tự đánh giá — không chấm tự động)
        </p>
      ) : result.correct ? (
        <p className="text-sm font-semibold text-green-600">✅ Chính xác</p>
      ) : (
        <p className="text-sm font-semibold text-red-600">❌ Chưa đúng</p>
      )}

      {/* Câu trả lời của user */}
      {userAnswer && (
        <div>
          <p className="text-xs text-text-secondary">Câu trả lời của bạn:</p>
          <p className="text-sm font-medium text-text-primary">{userAnswer}</p>
        </div>
      )}

      {/* Đáp án / câu mẫu tham khảo */}
      {result.correctAnswer &&
        (result.selfCheck ? (
          <div>
            <p className="text-xs text-text-secondary">Câu mẫu tham khảo:</p>
            <p className="text-sm font-medium text-text-primary">{result.correctAnswer}</p>
          </div>
        ) : (
          <div>
            <p className="text-xs text-text-secondary">Đáp án:</p>
            <p className="text-sm font-medium text-text-primary">{result.correctAnswer}</p>
          </div>
        ))}

      {/* REVEAL cấu trúc — CHỈ sau khi đã trả lời; PURE TEST (GOOD/EASY)
          KHÔNG render block này: phiên là bài kiểm tra phản xạ, không dạy lại
          công thức/pattern ngay sau mỗi lần test. */}
      {revealStructure !== false && structure && (
        <div className="rounded-lg border border-border-color bg-surface p-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">
            {revealLabel}
          </p>
          <p className="mt-0.5 text-base font-bold text-text-primary">{structure.pattern}</p>
          {structure.meaning && (
            <p className="text-sm text-text-secondary">{structure.meaning}</p>
          )}
          {explanation && <p className="mt-1 text-sm text-text-secondary">{explanation}</p>}
        </div>
      )}

      {result.reason && !result.selfCheck && result.correct === false && (
        <p className="text-xs text-text-secondary">{result.reason}</p>
      )}

      <Button onClick={onNext} className="mt-1">
        Tiếp tục
      </Button>
    </div>
  );
}




