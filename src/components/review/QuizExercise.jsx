import { useEffect, useState, useCallback } from "react";
import VocabularyAnswerDetails from "../VocabularyAnswerDetails.jsx";

export default function QuizExercise({ item, options, onSubmitRating, ratingSection, onAnswered }) {
  const [selected, setSelected] = useState(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    setSelected(null);
    setSubmitted(false);
  }, [item?.id]);

  const correct = submitted && selected !== null && options[selected] === ((item && (item.meaning || item.vietnamese || item.definition_vi || item.definitionVi)) || "");

  const getWord = (it) => (it && (it.word || it.english)) || "";
  const word = getWord(item);

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
  const playAudio = () => {
    if (!hasAudio || !word) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(word);
    u.lang = "en-US";
    u.rate = 0.9;
    window.speechSynthesis.speak(u);
  };

  const ipa = item && (item.ipa || item.IPA);
  const pos = item && (item.part_of_speech || item.pos || item.word_type);
  const example = item && (item.example || item.example_sentence);
  const exampleVi = item && (item.example_vi || item.example_meaning);

  const choose = useCallback(
    (idx) => {
      if (submitted) return;
      if (!options || idx < 0 || idx >= options.length) return;
      setSelected(idx);
      setSubmitted(true);
      if (typeof onAnswered === 'function') onAnswered();
    },
    [submitted, options, onAnswered]
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
        CHỌN NGHĨA TIẾNG VIỆT CHÍNH XÁC
      </p>

      {level && (
        <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-600 border border-indigo-150 mb-2">
          {level}
        </span>
      )}

      <div className="flex items-center justify-center gap-2 mb-4">
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-800">
          {word}
        </h2>
        {hasAudio && (
          <button
            type="button"
            onClick={playAudio}
            aria-label="Phát âm từ"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-200"
          >
            🔊
          </button>
        )}
      </div>

      {ipa && (
        <p className="text-sm font-mono text-gray-500 italic mb-4">
          /{ipa}/
        </p>
      )}

      {pos && (
        <p className="text-xs text-gray-400 mb-4">{pos}</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6 mt-6">
        {options.map((opt, idx) => {
          const isCorrectOption = opt === ((item && (item.meaning || item.vietnamese || item.definition_vi || item.definitionVi)) || "");
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
        <div className="mt-5 mb-5">
          <VocabularyAnswerDetails word={item} />
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
