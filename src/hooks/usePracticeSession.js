import { useState, useCallback, useMemo } from 'react';
import { ttsService } from '../../tts.service.js';

// Phiên luyện tập "Hoc nhanh" - TACH HOAN TOAN khoi SRS.
// KHONG ghi tien trinh nguoi dung. KHONG goi bat ky ham SRS nao.
// Typin: tra loi SAI -> card tu dong danh dau reviewNeeded -> requeue.
// Tra loi DUNG -> khong requeue. Flashcard: chi requeue khi bam "Xem lai".

/**
 * "Tiếp tục": bỏ card hiện tại khỏi queue (coi là hoàn thành trong lượt này).
 * @returns { queue, currentIndex, completed }
 */
export function continueCardFromDeck(queue = [], currentIndex = 0) {
  const arr = queue.slice();
  const [completed] = arr.splice(currentIndex, 1);
  if (arr.length === 0) {
    return { queue: [], currentIndex: 0, completed: completed || null };
  }
  return {
    queue: arr,
    currentIndex: Math.min(currentIndex, arr.length - 1),
    completed: completed || null,
  };
}

/**
 * "Xem lại": card hiện tại quay lại queue, xuất hiện sau 1 card tiếp theo.
 * VD: [A,B,C,D] @A -> Xem lại -> [B,A,C,D] (@B được hiển thị kế tiếp).
 */
export function reviewCardFromDeck(queue = [], currentIndex = 0) {
  const arr = queue.slice();
  const [card] = arr.splice(currentIndex, 1);
  if (arr.length === 0) {
    // Chỉ còn 1 card -> chính nó sẽ được hiển thị lại ngay.
    return { queue: [card], currentIndex: 0 };
  }
  const insertAt = Math.min(currentIndex + 1, arr.length);
  arr.splice(insertAt, 0, card);
  const nextIndex = currentIndex < arr.length - 1 ? currentIndex : 0;
  return { queue: arr, currentIndex: nextIndex };
}

/**
 * Gộp từ từ nhiều bộ, loại bỏ trùng word_sense (id).
 * Một từ dùng chung ở 2 bộ chỉ xuất hiện một lần trong session.
 */
export function mergePracticeWords(listOfWordArrays = []) {
  const seen = new Set();
  const merged = [];
  for (const words of listOfWordArrays) {
    for (const w of words || []) {
      const key = w?.id ?? w?.word;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(w);
    }
  }
  return merged;
}

export function usePracticeSession(words = []) {
  const [sessionMode, setSessionMode] = useState(null); // null | 'flashcard' | 'typing'
  const [queue, setQueue] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [input, setInput] = useState('');
  const [feedback, setFeedback] = useState(null); // { status: 'correct' | 'incorrect' }
  const [answered, setAnswered] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);

  // Các card đang được đánh dấu cần xem lại lại trong session (trả lời sai >=1 lần
  // và chưa trả lời đúng). CHỈ áp dụng cho Typing — không liên quan tới SRS.
  const [reviewNeeded, setReviewNeeded] = useState(new Set());

  const currentWord = useMemo(
    () => queue[currentIndex] ?? null,
    [queue, currentIndex]
  );
  const isComplete = sessionMode !== null && queue.length === 0 && reviewNeeded.size === 0;
  const currentIsReviewNeeded = !!currentWord && reviewNeeded.has(currentWord.id);

  const resetPresentation = useCallback(() => {
    setFlipped(false);
    setInput('');
    setFeedback(null);
    setAnswered(false);
  }, []);

  const speakWord = useCallback((text) => {
    try {
      ttsService.speak(text);
    } catch (e) {
      /* TTS lỗi/không hỗ trợ — không làm gián đoạn luyện tập */
    }
  }, []);

  const startSession = useCallback(
    (mode) => {
      if (!['flashcard', 'typing'].includes(mode)) return;
      setSessionMode(mode);
      setQueue(words.slice());
      setCurrentIndex(0);
      setCompletedCount(0);
      setReviewNeeded(new Set());
      resetPresentation();
    },
    [words, resetPresentation]
  );

  const flipCard = useCallback(() => {
    if (sessionMode !== 'flashcard' || !currentWord || flipped) return;
    setFlipped(true);
    speakWord(currentWord.word);
  }, [sessionMode, currentWord, flipped, speakWord]);

    const submitAnswer = useCallback(() => {
    if (sessionMode !== 'typing' || !currentWord || answered) return;
    const answer = input.trim().toLowerCase();
    const correctAnswer = String(currentWord.word || '').toLowerCase();
    // Exact match OR prefix match (typing first letter of the word counts)
    const correct = answer === correctAnswer || correctAnswer.startsWith(answer);
    setFeedback({ status: correct ? 'correct' : 'incorrect' });
    setAnswered(true);
    if (correct) {
      // Trả lời đúng -> không còn cần review; xóa cờ (nếu có).
      setReviewNeeded((prev) => {
        if (!prev.has(currentWord.id)) return prev;
        const next = new Set(prev);
        next.delete(currentWord.id);
        return next;
      });
    } else {
      // Trả lời sai -> tự động đánh dấu cần review; card sẽ requeue khi Continue.
      setReviewNeeded((prev) => {
        if (prev.has(currentWord.id)) return prev;
        return new Set(prev).add(currentWord.id);
      });
    }
    speakWord(currentWord.word);
  }, [sessionMode, currentWord, answered, input, speakWord]);

  const canAct =
    sessionMode !== null &&
    !isComplete &&
    !!currentWord &&
    (sessionMode === 'flashcard' ? flipped : answered);

  const handleContinue = useCallback(() => {
    if (!canAct) return;
    if (currentIsReviewNeeded) {
      // Card vừa trả lời sai -> tự động requeue (sau 1 card kế tiếp),
      // KHÔNG tính là hoàn thành trong lượt này.
      const next = reviewCardFromDeck(queue, currentIndex);
      setQueue(next.queue);
      setCurrentIndex(next.currentIndex);
      resetPresentation();
    } else {
      const next = continueCardFromDeck(queue, currentIndex);
      setQueue(next.queue);
      setCurrentIndex(next.currentIndex);
      setCompletedCount((c) => c + (next.completed ? 1 : 0));
      resetPresentation();
    }
  }, [canAct, queue, currentIndex, currentIsReviewNeeded, resetPresentation]);

  const handleReview = useCallback(() => {
    if (!canAct) return;
    // Xem lại thủ công: luôn requeue (áp dụng cả flashcard).
    const next = reviewCardFromDeck(queue, currentIndex);
    setQueue(next.queue);
    setCurrentIndex(next.currentIndex);
    resetPresentation();
  }, [canAct, queue, currentIndex, resetPresentation]);

  const speakCurrent = useCallback(() => {
    if (currentWord) speakWord(currentWord.word);
  }, [currentWord, speakWord]);

  return {
    sessionMode,
    queue,
    currentIndex,
    currentWord,
    flipped,
    input,
    feedback,
    answered,
    isComplete,
    completedCount,
    canAct,
    isReviewNeeded: currentIsReviewNeeded,
    startSession,
    flipCard,
    submitAnswer,
    handleContinue,
    handleReview,
    speakCurrent,
    setInput,
  };
}
