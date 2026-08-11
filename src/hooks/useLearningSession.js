import { useState, useEffect, useCallback, useMemo } from 'react';
import { getWordsInSet } from '../services/vocabulary.service.js';
import { useLearning } from './useLearning.js';
import { RATING } from '../services/srs.service.js';

// Map UI rating strings to SRS rating numbers
const RATING_MAP = {
  again: RATING.AGAIN, // 0
  hard: RATING.HARD,   // 2
  good: RATING.GOOD,   // 3
};

const MAX_AGAIN_COUNT = 2; // Số lần tối đa một từ có thể được "Again" trong một session

/**
 * Hook quản lý logic của một phiên học từ vựng.
 * @param {string} setId - ID của bộ từ.
 */
export function useLearningSession(setId) {
  const { recordProgress } = useLearning();
  const [allWords, setAllWords] = useState([]); // Danh sách từ gốc của bộ
  const [sessionQueue, setSessionQueue] = useState([]); // Hàng đợi các từ trong phiên học
  const [currentIndex, setCurrentIndex] = useState(0); // Vị trí hiện tại trong sessionQueue
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isSessionComplete, setIsSessionComplete] = useState(false);
  const [isRating, setIsRating] = useState(false); // State for when SRS update is in progress

  const [userInput, setUserInput] = useState('');
  const [isAnswerRevealed, setIsAnswerRevealed] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);

  const [lastReviewResult, setLastReviewResult] = useState(null); // Để lưu kết quả SRS mới nhất

  // Thống kê phiên học
  const [stats, setStats] = useState({
    totalWords: 0,
    correctAnswers: 0,
    needsReview: 0,
    againCount: 0,
    attemptedWords: new Set(), // Để đếm số từ duy nhất đã học
  });

  const currentWord = useMemo(() => {
    if (sessionQueue.length === 0 || currentIndex >= sessionQueue.length) {
      return null;
    }
    return sessionQueue[currentIndex];
  }, [sessionQueue, currentIndex]);

  const loadWords = useCallback(async () => {
    if (!setId) {
      setError('Không tìm thấy ID bộ từ.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setIsSessionComplete(false);
    setCurrentIndex(0);
    setUserInput('');
    setIsAnswerRevealed(false);
    setIsCorrect(false);
    setLastReviewResult(null);
    setStats({
      totalWords: 0,
      correctAnswers: 0,
      needsReview: 0,
      againCount: 0,
      attemptedWords: new Set(),
    });

    const { data, error: err } = await getWordsInSet(setId);

    if (err) {
      setError('Không thể tải từ vựng cho phiên học. Vui lòng thử lại.');
      setLoading(false);
      return;
    }

    if (!data || data.length === 0) {
      setError('Bộ từ này chưa có từ nào để học.');
      setLoading(false);
      return;
    }

    // Sắp xếp từ để ưu tiên học: 1. Due, 2. Learning, 3. New
    const now = new Date().toISOString();
    const dueWords = data.filter(
      (w) => w.state !== 'new' && w.review_due_at && w.review_due_at <= now
    );
    const learningWords = data.filter(
      (w) => (w.state === 'learning' || w.state === 'relearning') && w.review_due_at > now
    );
    const newWords = data.filter((w) => w.state === 'new');

    // Sắp xếp các từ quá hạn theo thời gian quá hạn lâu nhất
    dueWords.sort((a, b) => new Date(a.review_due_at) - new Date(b.review_due_at));

    const sortedQueue = [...dueWords, ...learningWords, ...newWords];

    const initialQueue = sortedQueue.map((word) => ({ ...word, againCount: 0 }));
    setAllWords(data);
    setSessionQueue(initialQueue);
    setStats((prev) => ({ ...prev, totalWords: data.length }));
    setLoading(false);
  }, [setId]);

  useEffect(() => {
    loadWords();
  }, [loadWords]);

  const normalizeAnswer = (answer) => {
    return String(answer || '').trim().toLowerCase();
  };

  const submitAnswer = useCallback(() => {
    if (!currentWord || isAnswerRevealed) return;

    const normalizedInput = normalizeAnswer(userInput);
    const normalizedCorrectWord = normalizeAnswer(currentWord.word);

    const correct = normalizedInput === normalizedCorrectWord;
    setIsCorrect(correct);
    setIsAnswerRevealed(true);

    setStats((prev) => {
      const newAttemptedWords = new Set(prev.attemptedWords).add(currentWord.id);
      return {
        ...prev,
        correctAnswers: prev.correctAnswers + (correct ? 1 : 0),
        needsReview: prev.needsReview + (correct ? 0 : 1),
        attemptedWords: newAttemptedWords,
      };
    });
  }, [currentWord, userInput, isAnswerRevealed]);

  const handleRating = useCallback(
    (rating) => {
      if (!currentWord || isRating) return;

      setIsRating(true);
      setError(null);

      // 1. Ghi nhận tiến trình vào DB thông qua SRS service
      recordProgress(currentWord.id, { rating: RATING_MAP[rating] }).then(
        ({ progress, error: srsError }) => {
          if (srsError) {
            setError('Không thể lưu tiến trình học. Vui lòng thử lại.');
            setIsRating(false);
            return; // Dừng lại nếu không lưu được
          }

          // 2. Cập nhật queue nếu cần (chỉ sau khi lưu thành công)
          // Tăng againCount cho từ hiện tại
          if (rating === 'again') {
            setStats((prev) => ({ ...prev, againCount: prev.againCount + 1 }));
            const updatedWord = { ...currentWord, againCount: currentWord.againCount + 1 };

            if (updatedWord.againCount <= MAX_AGAIN_COUNT) {
              // Đưa từ trở lại hàng đợi sau một vài từ khác
              const insertIndex = Math.min(
                currentIndex + Math.floor(sessionQueue.length / 3) + 1,
                sessionQueue.length
              );
              // Tạo một bản sao mới của queue để React nhận diện sự thay đổi
              const newQueue = [...sessionQueue];
              newQueue.splice(insertIndex, 0, updatedWord);
              setSessionQueue(newQueue);
            }
          }

          setLastReviewResult(progress); // Lưu kết quả SRS mới nhất để UI hiển thị
          setIsRating(false); // Hoàn tất rating
        }
      );
    },
    [currentWord, isRating, recordProgress, currentIndex, sessionQueue.length]
  );

  const proceedToNext = useCallback(() => {
    const newCurrentIndex = currentIndex + 1;
    if (newCurrentIndex >= sessionQueue.length) {
      setIsSessionComplete(true);
      return;
    }
  
    // Reset trạng thái cho từ tiếp theo
    // Reset trạng thái cho từ tiếp theo
    setCurrentIndex(newCurrentIndex);
    setUserInput('');
    setIsAnswerRevealed(false);
    setIsCorrect(false);
    setLastReviewResult(null);
  }, [currentIndex, sessionQueue.length]);

  const restartSession = useCallback(() => {
    loadWords(); // Tải lại toàn bộ từ và khởi tạo lại session
  }, [loadWords]);

  const exitSession = useCallback(() => {
    // Logic thoát phiên học, có thể điều hướng về trang chi tiết bộ từ
    // (sẽ được xử lý trong component UI)
  }, []);

  const progress = useMemo(() => {
    if (sessionQueue.length === 0) return 0;
    return Math.min(100, Math.floor((currentIndex / sessionQueue.length) * 100));
  }, [currentIndex, sessionQueue.length]);

  const wordsRemaining = useMemo(() => {
    return sessionQueue.length - currentIndex;
  }, [currentIndex, sessionQueue.length]);

  return {
    loading,
    error,
    currentWord,
    userInput,
    isAnswerRevealed,
    isCorrect,
    isSessionComplete,
    progress,
    lastReviewResult,
    isRating,
    wordsRemaining,
    stats,
    setUserInput,
    submitAnswer,
    handleRating,
    proceedToNext,
    restartSession,
    exitSession,
    sessionQueueLength: sessionQueue.length,
  };
}