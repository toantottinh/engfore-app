export function getExerciseType(item, progress) {
  const p = progress[item.id] || { state: "new", sessionStep: 0, graduated: false };
  if (p.state === "new" && (p.sessionStep || 0) < 2) return "FLASHCARD";
  if (p.state === "again") {
    // alternate typing/quiz based on session step parity
    return (p.sessionStep || 0) % 2 === 0 ? "TYPING" : "QUIZ";
  }
  return (p.sessionStep || 0) % 2 === 0 ? "TYPING" : "QUIZ";
}