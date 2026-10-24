import { useEffect, useRef, useState, useCallback } from "react";

export default function TypingExercise({ item, onSubmitRating, onWrongRequeue }) {
  const inputRef = useRef(null);
  const [value, setValue] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [correct, setCorrect] = useState(false);
  const currentWord = item; // alias for clarity

  useEffect(() => {
    setValue("");
    setSubmitted(false);
    setCorrect(false);
    const t = setTimeout(() => inputRef.current && inputRef.current.focus(), 50);
    return () => clearTimeout(t);
  }, [item.id]);

  const handleCheck = (e) => {
    if (e) e.preventDefault();
    if (submitted) return;
    const ok = value.trim().toLowerCase() === item.word.toLowerCase();
    setCorrect(ok);
    setSubmitted(true);
    if (!ok && onWrongRequeue) onWrongRequeue(item);
  };

  const rate = (r) => {
    onSubmitRating(r, item, !correct);
  };

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
  }, [submitted]);

  const playAudio = useCallback((textToSpeak) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    synth.cancel();
    const text = textToSpeak || item?.word || item?.english || "";
    if (!text) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 0.9;
    synth.speak(utterance);
  }, [item]);

  // Tự động phát âm khi có kết quả
  useEffect(() => {
    if (submitted && currentWord) {
      window.speechSynthesis.cancel();

      const textToSpeak = currentWord.word || currentWord.english || '';
      const exampleToSpeak = currentWord.example || currentWord.example_sentence || '';

      if (textToSpeak) {
        const wordUtterance = new SpeechSynthesisUtterance(textToSpeak);
        wordUtterance.lang = 'en-US';
        wordUtterance.rate = 0.9;

        if (exampleToSpeak) {
          wordUtterance.onend = () => {
            setTimeout(() => {
              const exUtterance = new SpeechSynthesisUtterance(exampleToSpeak);
              exUtterance.lang = 'en-US';
              exUtterance.rate = 0.9;
              window.speechSynthesis.speak(exUtterance);
            }, 300);
          };
        }

        window.speechSynthesis.speak(wordUtterance);
      }
    }
    return () => window.speechSynthesis.cancel();
  }, [submitted, currentWord]);

  return (
    <div className="exercise">
      <div className="prompt-card">
        <p className="kicker">Gõ từ tiếng Anh</p>
        <h2 className="meaning">{item.meaning}</h2>
        {item.pos && <span className="chip">{item.pos}</span>}
      </div>

      <form onSubmit={handleCheck} className="typing-form">
        <input
          ref={inputRef}
          className="typing-input"
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Nhập từ..."
          autoComplete="off"
          disabled={submitted}
        />
        {!submitted && (
          <button className="btn btn-primary" type="submit">Kiểm tra (Enter)</button>
        )}
      </form>

      {submitted && (
        <div className={`result ${correct ? "ok" : "bad"}`}>
          {correct ? (
            <p className="result-text ok">✓ Chính xác!</p>
          ) : (
            <>
              <p className="result-text bad">✕ Chưa chính xác</p>
              <div className="answer-box">
                <div className="answer-word">{item.word}</div>
                <div className="answer-ipa">{item.ipa}</div>
                <button className="btn btn-ghost" type="button" onClick={playAudio}>🔊 Nghe</button>
              </div>
              {(item.example || item.example_sentence) && (
                <div className="flex items-center gap-2 mt-2">
                  <span className="italic text-gray-700 text-sm sm:text-base">
                    "{item.example || item.example_sentence}"
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      playAudio(item.example || item.example_sentence);
                    }}
                    className="p-1 text-gray-400 hover:text-indigo-600 rounded hover:bg-gray-100 transition-colors"
                    title="Nghe câu ví dụ"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    </svg>
                  </button>
                </div>
              )}
            </>
          )}
          <div className="rating-row">
            <button className="rate-btn again" onClick={() => rate("again")}>[1] Lại</button>
            <button className="rate-btn hard" onClick={() => rate("hard")}>[2] Khó</button>
            <button className="rate-btn good" onClick={() => rate("good")}>[3] Tốt</button>
            <button className="rate-btn easy" onClick={() => rate("easy")}>[4] Dễ</button>
          </div>
        </div>
      )}
    </div>
  );
}
