import { useEffect, useState } from "react";

export default function FlashcardExercise({ item, onSubmitRating }) {
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    setFlipped(false);
  }, [item.id]);

  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setFlipped(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (!flipped) return;
    const handler = (e) => {
      const map = { "1": "again", "2": "hard", "3": "good", "4": "easy" };
      if (map[e.key]) {
        e.preventDefault();
        onSubmitRating(map[e.key], item, false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [flipped, item, onSubmitRating]);

  const playAudio = () => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(item.word));
    }
  };

  return (
    <div className="exercise">
      <div className={`flashcard ${flipped ? "flipped" : ""}`} onClick={() => setFlipped(true)}>
        <div className="flashcard-front">
          <p className="kicker">Từ mới</p>
          <h2 className="word">{item.word}</h2>
          <p className="ipa">{item.ipa}</p>
          {item.pos && <span className="chip">{item.pos}</span>}
          <p className="hint">Nhấn Space/Enter để lật thẻ</p>
        </div>
        <div className="flashcard-back">
          <p className="meaning">{item.meaning}</p>
          {item.example && <p className="example">“{item.example}”</p>}
          <button className="btn btn-ghost" type="button" onClick={(e) => { e.stopPropagation(); playAudio(); }}>🔊 Nghe</button>
        </div>
      </div>
      {flipped && (
        <div className="rating-row" style={{ marginTop: 16 }}>
          <button className="rate-btn again" onClick={() => onSubmitRating("again", item, false)}>[1] Lại</button>
          <button className="rate-btn hard" onClick={() => onSubmitRating("hard", item, false)}>[2] Khó</button>
          <button className="rate-btn good" onClick={() => onSubmitRating("good", item, false)}>[3] Tốt</button>
          <button className="rate-btn easy" onClick={() => onSubmitRating("easy", item, false)}>[4] Dễ</button>
        </div>
      )}
    </div>
  );
}
