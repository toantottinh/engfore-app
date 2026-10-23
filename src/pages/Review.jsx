import { useEffect, useMemo, useState } from "react";
import StatsHeader from "../components/review/StatsHeader";
import QueueCounter from "../components/review/QueueCounter";
import FlashcardExercise from "../components/review/FlashcardExercise";
import TypingExercise from "../components/review/TypingExercise";
import QuizExercise from "../components/review/QuizExercise";
import SessionComplete from "../components/review/SessionComplete";
import { getExerciseType } from "../utils/exerciseResolver";

const CURATED = [
  { id: "w1", word: "Astonish", ipa: "/əˈstɒnɪʃ/", meaning: "Làm ngạc nhiên", example: "The magician's tricks will astonish you.", pos: "Verb" },
  { id: "w2", word: "Ubiquitous", ipa: "/juːˈbɪkwɪtəs/", meaning: "Phổ biến, ở đâu cũng có", example: "Coffee shops are ubiquitous in the city.", pos: "Adjective" },
  { id: "w3", word: "Implement", ipa: "/ˈɪmplɪment/", meaning: "Triển khai", example: "We will implement the new system next week.", pos: "Verb" },
  { id: "w4", word: "Revenue", ipa: "/ˈrevənuː/", meaning: "Doanh thu", example: "The company reported record revenue.", pos: "Noun" },
  { id: "w5", word: "Negotiate", ipa: "/nɪˈɡəʊʃieɪt/", meaning: "Đàm phán", example: "We need to negotiate a better deal.", pos: "Verb" },
  { id: "w6", word: "Algorithm", ipa: "/ˈælɡərɪðəm/", meaning: "Thuật toán", example: "This algorithm sorts data efficiently.", pos: "Noun" },
  { id: "w7", word: "Develop", ipa: "/dɪˈveləp/", meaning: "Phát triển", example: "The company plans to develop new software.", pos: "Verb" },
  { id: "w8", word: "Sustainable", ipa: "/səˈsteɪnəbl/", meaning: "Bền vững", example: "We need sustainable growth.", pos: "Adjective" },
  { id: "w9", word: "Stakeholder", ipa: "/ˈsteɪkhəʊldə/", meaning: "Bên liên quan", example: "All stakeholders approved the plan.", pos: "Noun" },
  { id: "w10", word: "Serendipity", ipa: "/ˌserənˈdɪpəti/", meaning: "Sự tình cờ may mắn", example: "Finding that book was pure serendipity.", pos: "Noun" },
];

const DAILY_GOAL = 10;

function loadProgress() {
  try { return JSON.parse(localStorage.getItem("engfore-progress") || "{}"); } catch { return {}; }
}
function saveProgress(p) { localStorage.setItem("engfore-progress", JSON.stringify(p)); }

function loadNewToday() {
  const raw = localStorage.getItem("engfore-new-today");
  if (!raw) return 0;
  try {
    const { date, count } = JSON.parse(raw);
    if (date === new Date().toDateString()) return count;
    return 0;
  } catch { return 0; }
}
function saveNewToday(n) {
  localStorage.setItem("engfore-new-today", JSON.stringify({ date: new Date().toDateString(), count: n }));
}

export default function ReviewPage() {
  const [progress, setProgress] = useState(loadProgress);
  const [newToday, setNewToday] = useState(loadNewToday);
  const [queue, setQueue] = useState([]);
  const [index, setIndex] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const p = loadProgress();
    setProgress(p);
    const now = Date.now();
    const due = [];
    const fresh = [];
    for (const w of CURATED) {
      const pr = p[w.id];
      if (!pr) fresh.push(w);
      else if (pr.state === "again" || (pr.nextReviewAt || 0) <= now) due.push(w);
    }
    const remainingNewSlots = Math.max(0, DAILY_GOAL - loadNewToday());
    const q = [...due, ...fresh.slice(0, Math.max(3, remainingNewSlots))];
    setQueue(q);
    setReady(true);
  }, []);

  const current = index < queue.length ? queue[index] : null;
  const progressCounts = useMemo(() => {
    const vals = Object.values(progress);
    return {
      learning: vals.filter((p) => p.state === "learning").length,
      newWords: CURATED.filter((w) => !progress[w.id]).length,
    };
  }, [progress]);

  const queueCounts = useMemo(() => {
    const rest = queue.slice(index);
    return {
      newCount: rest.filter((w) => !(progress[w.id])).length,
      againCount: rest.filter((w) => progress[w.id]?.state === "again").length,
      reviewCount: rest.filter((w) => progress[w.id] && progress[w.id].state !== "again" && progress[w.id].state !== "new").length,
    };
  }, [queue, index, progress]);

  const quizOptions = useMemo(() => {
    if (!current) return [];
    const others = CURATED.filter((w) => w.id !== current.id).map((w) => w.word);
    const shuffled = others.sort(() => Math.random() - 0.5).slice(0, 3);
    const opts = [...shuffled, current.word].sort(() => Math.random() - 0.5);
    return opts;
  }, [current]);

  const handleRating = (rating, item, wasWrong) => {
    const p = progress[item.id] || { state: "new", sessionStep: 0, graduated: false, repetitions: 0, ease: 2.5 };
    const wasNew = !progress[item.id];
    const now = Date.now();
    if (rating === "again") {
      p.state = "again";
      p.nextReviewAt = now + 60 * 1000;
      p.repetitions = Math.max(0, (p.repetitions || 0) - 1);
    } else if (rating === "hard") {
      p.state = "learning";
      p.nextReviewAt = now + 6 * 60 * 1000;
    } else if (rating === "good") {
      p.state = (p.sessionStep || 0) >= 1 ? "review" : "learning";
      p.sessionStep = (p.sessionStep || 0) + 1;
      p.nextReviewAt = now + 24 * 60 * 60 * 1000;
      p.repetitions = (p.repetitions || 0) + 1;
    } else if (rating === "easy") {
      p.state = "review";
      p.sessionStep = (p.sessionStep || 0) + 1;
      p.graduated = true;
      p.nextReviewAt = now + 4 * 24 * 60 * 60 * 1000;
      p.repetitions = (p.repetitions || 0) + 1;
    }
    const newProgress = { ...progress, [item.id]: p };
    setProgress(newProgress);
    saveProgress(newProgress);

    if (wasNew) {
      const nt = newToday + 1;
      setNewToday(nt);
      saveNewToday(nt);
    }

    const newQueue = [...queue];
    newQueue.splice(index, 1);
    if (rating === "again" || wasWrong) {
      const insertAt = Math.min(index + 4, newQueue.length);
      newQueue.splice(insertAt, 0, item);
    }
    setQueue(newQueue);
    if (index >= newQueue.length) {
      setIndex(newQueue.length);
    }
  };
  if (!ready) return <div className="page">Đang tải...</div>;

  const complete = index >= queue.length || queue.length === 0;

  return (
    <div className="page review-page">
      <h1>Học ngắt quãng (SRS)</h1>
      <StatsHeader
        newToday={newToday}
        dailyGoal={DAILY_GOAL}
        total={CURATED.length}
        learning={progressCounts.learning}
        newWords={progressCounts.newWords}
      />
      {!complete && current && (
        <>
          <QueueCounter
            newCount={queueCounts.newCount}
            againCount={queueCounts.againCount}
            reviewCount={queueCounts.reviewCount}
          />
          <div className="exercise-wrap">
            {(() => {
              const type = getExerciseType(current, progress);
              if (type === "FLASHCARD") {
                return <FlashcardExercise item={current} onSubmitRating={handleRating} />;
              }
              if (type === "TYPING") {
                return <TypingExercise item={current} onSubmitRating={handleRating} onWrongRequeue={() => {}} />;
              }
              return <QuizExercise item={current} options={quizOptions} onSubmitRating={handleRating} />;
            })()}
          </div>
        </>
      )}
      {complete && <SessionComplete />}
    </div>
  );
}