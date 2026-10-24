import { useEffect, useState, useCallback } from "react";

export default function QuizExercise({ item, options, onSubmitRating, ratingSection }) {
  const [selected, setSelected] = useState(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    setSelected(null);
    setSubmitted(false);
  }, [item.id]);

  const correct = submitted && selected !== null && options[selected] === item.word;

  const level = (item && (item.cefr_level || item.level || item.cefr)) || "";
  const clue =
    (item &&
      (item.definition ||
        item.clue ||
        item.hint ||
        item.memory_clue ||
        item.description)) ||
    "";

  const isAnswered = submitted;
  const hasAudio =
    typeof window !== "undefined" && "speechSynthesis" in window;

  const playAudio = useCallback(() => {
    if (!hasAudio || !item?.word) return;
    const synth = window.speechSynthesis;
    synth.cancel();

    const wordText = item.word;
    const exampleText = item.example || item.example_sentence;

    const wordUtterance = new SpeechSynthesisUtterance(wordText);
    wordUtterance.lang = "en-US";
    wordUtterance.rate = 0.9;

    if (exampleText) {
      wordUtterance.onend = () => {
        window.setTimeout(() => {
          const exampleUtterance = new SpeechSynthesisUtterance(exampleText);
          exampleUtterance.lang = "en-US";
          exampleUtterance.rate = 0.9;
          synth.speak(exampleUtterance);
        }, 300);
      };
    }

    synth.speak(wordUtterance);
  }, [hasAudio, item]);

  // Tự động phát âm từ vựng + ví dụ sau khi trả lời
  useEffect(() => {
    if (!isAnswered || !item) return;
    playAudio();
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [isAnswered, item, playAudio]);

  const pos = item && (item.part_of_speech || item.pos || item.word_type);
  const example = item && (item.example || item.example_sentence);
  const exampleVi = item && (item.example_vi || item.example_meaning);

  const choose = useCallback(
    (idx) => {
      if (submitted) return;
      if (!options || idx < 0 || idx >= options.length) return;
      setSelected(idx);
      setSubmitted(true);
    },
    [submitted, options]
  );

  const rate = useCallback(
    (r) => {
      if (onSubmitRating) onSubmitRating(r, item, !correct);
    },
    [onSubmitRating, item, correct]
  );

  // Phím tắt số 1-4 để chọn nhanh đáp án khi chưa trả lời
  useEffect(() => {
    if (submitted) return;
    const handler = (e) => {
      if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= 4 && options && options[n - 1]) {
        choose(n - 1);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [submitted, options, choose]);

  // Phím tắt số 1-4 để đánh giá SRS sau khi đã trả lời
  useEffect(() => {
    if (!submitted) return;
    const handler = (e) => {
      const map = { "1": "again", "2": "hard", "3": "good", "4": "easy" };
      if (map[e.key]) {
        e.preventDefault();
        rate(map[e.key]);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [submitted, rate]);

  return (
    <div className="max-w-xl mx-auto bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8 mt-6 text-center">
      <p className="text-xs uppercase tracking-wider font-semibold text-gray-400 mb-2">
        Chọn từ tiếng Anh chính xác
      </p>

      {level && (
        <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-600 border border-indigo-150 mb-2">
          {level}
        </span>
      )}

      <h2 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-6">
        {item.meaning}
      </h2>

      {clue && (
        <p className="text-sm sm:text-base text-gray-500 font-normal italic max-w-md mx-auto mt-2 leading-relaxed">
          {clue}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6 mt-6">
        {options.map((opt, idx) => {
          const isCorrectOption = opt === item.word;
          const isSelected = idx === selected;

          let stateClasses = "border-gray-200 hover:border-indigo-400 hover:bg-indigo-50/40 cursor-pointer";
          if (submitted) {
            if (isCorrectOption) {
              stateClasses = "border-emerald-500 bg-emerald-50 text-emerald-800 font-semibold";
            } else if (isSelected) {
              stateClasses = "border-rose-500 bg-rose-50 text-rose-800";
            } else {
              stateClasses = "border-gray-200 opacity-60 pointer-events-none";
            }
          }

          const wordClasses = submitted
            ? isCorrectOption
              ? "text-center font-semibold text-lg text-emerald-800 px-8 break-words"
              : isSelected
              ? "text-center font-medium text-lg text-rose-800 px-8 break-words"
              : "text-center font-medium text-lg text-gray-800 px-8 break-words"
            : "text-center font-medium text-lg text-gray-800 px-8 break-words";

          return (
            <button
              key={idx}
              type="button"
              onClick={() => choose(idx)}
              disabled={submitted}
              className={`relative flex items-center justify-center p-4 min-h-[68px] rounded-xl border-2 transition-all ${stateClasses}`}
            >
              <span className="absolute left-4 top-1/2 -translate-y-1/2 px-2 py-1 rounded bg-gray-100 text-xs font-semibold text-gray-500">
                {idx + 1}
              </span>
              <span className={wordClasses}>{opt}</span>
            </button>
          );
        })}
      </div>

      {isAnswered && (
        <div className="mt-5 mb-5 p-4 rounded-xl bg-slate-50 border border-slate-200/80 text-left animate-fadeIn">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xl font-bold text-gray-900">{item.word}</span>
            {hasAudio && (
              <button
                type="button"
                onClick={playAudio}
                aria-label="Phát âm từ"
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-gray-500 hover:bg-gray-200"
              >
                🔊
              </button>
            )}
            {item.ipa && (
              <span className="text-sm font-mono text-gray-500 italic ml-2.5">
                /{item.ipa}/
              </span>
            )}
            {pos && (
              <span className="text-xs px-2 py-0.5 rounded bg-gray-200 text-gray-700 font-medium ml-2">
                {pos}
              </span>
            )}
          </div>

          {example && (
            <p className="text-sm sm:text-base font-medium text-gray-800 mt-2.5 flex items-start gap-1.5">
              <span>“{example}”</span>
            </p>
          )}

          {exampleVi && (
            <p className="text-xs sm:text-sm text-gray-500 italic mt-0.5 pl-4">
              {exampleVi}
            </p>
          )}
        </div>
      )}

      {submitted && (
        <div className="mt-2">
          {ratingSection ?? (
            <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
              <button
                type="button"
                onClick={() => rate("again")}
                className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2.5 text-sm font-medium text-rose-700 transition-all hover:-translate-y-0.5"
              >
                [1] Lại
              </button>
              <button
                type="button"
                onClick={() => rate("hard")}
                className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm font-medium text-amber-700 transition-all hover:-translate-y-0.5"
              >
                [2] Khó
              </button>
              <button
                type="button"
                onClick={() => rate("good")}
                className="rounded-xl border border-indigo-300 bg-indigo-50 px-3 py-2.5 text-sm font-medium text-indigo-700 transition-all hover:-translate-y-0.5"
              >
                [3] Tốt
              </button>
              <button
                type="button"
                onClick={() => rate("easy")}
                className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2.5 text-sm font-medium text-emerald-700 transition-all hover:-translate-y-0.5"
              >
                [4] Dễ
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
