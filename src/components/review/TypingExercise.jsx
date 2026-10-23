import { useEffect, useRef, useState } from "react";

export default function TypingExercise({ item, onSubmitRating, onWrongRequeue }) {
  const inputRef = useRef(null);
  const [value, setValue] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [correct, setCorrect] = useState(false);

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

  const playAudio = () => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(item.word));
    }
  };

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
              {item.example && <p className="example">“{item.example}”</p>}
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
