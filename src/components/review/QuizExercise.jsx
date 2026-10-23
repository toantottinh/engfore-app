import { useEffect, useState } from "react";

export default function QuizExercise({ item, options, onSubmitRating }) {
  const [selected, setSelected] = useState(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    setSelected(null);
    setSubmitted(false);
  }, [item.id]);

  const choose = (idx) => {
    if (submitted) return;
    setSelected(idx);
    setSubmitted(true);
  };

  useEffect(() => {
    const handler = (e) => {
      if (submitted) return;
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= 4 && options[n - 1]) choose(n - 1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [submitted, options]);

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

  const correct = submitted && options[selected] === item.word;

  const rate = (r) => onSubmitRating(r, item, !correct);

  return (
    <div className="exercise">
      <div className="prompt-card">
        <p className="kicker">Chọn từ tiếng Anh đúng với nghĩa</p>
        <h2 className="meaning">{item.meaning}</h2>
      </div>
      <div className="quiz-options">
        {options.map((opt, idx) => {
          let cls = "quiz-option";
          if (submitted) {
            if (opt === item.word) cls += " correct";
            else if (idx === selected) cls += " wrong";
          }
          return (
            <button key={idx} className={cls} onClick={() => choose(idx)} disabled={submitted}>
              <span className="opt-key">{idx + 1}</span> {opt}
            </button>
          );
        })}
      </div>
      {submitted && (
        <div className={`result ${correct ? "ok" : "bad"}`}>
          <p className="result-text">{correct ? "✓ Chính xác!" : "✕ Chưa chính xác"}</p>
          {!correct && <p className="answer-word">{item.word} — {item.ipa}</p>}
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
