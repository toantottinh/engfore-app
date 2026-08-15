import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from './useAuth.jsx';
import { getWordsInSet } from '../services/vocabulary.service.js';
import {
  getDueReviewWords,
  FLASHCARD_REVIEWS_THRESHOLD,
  getUserDailyNewLimit,
  getDailyNewProgress,
  markDailyNewIntroduced,
} from '../services/learning.service.js';
import { DEFAULT_DAILY_NEW_LIMIT, selectNewWordsForToday } from '../services/quota.service.js';
import { useLearning } from './useLearning.js';
import { RATING, computeSrsPayload } from '../services/srs.service.js';

// Map UI rating strings to SRS rating numbers
const RATING_MAP = {
  again: RATING.AGAIN, // 0
  hard: RATING.HARD,   // 2
  good: RATING.GOOD,   // 3
  easy: RATING.EASY,   // 4
};

/**
 * Hook quản lý logic của một phiên học từ vựng.
 * @param {string|undefined} setId - ID của bộ từ (có thể undefined khi học qua review queue).
 */
export function useLearningSession(setId) {
  const { user } = useAuth();
  const { recordProgress } = useLearning();

  // Core state
  const [allWords, setAllWords] = useState([]); // Danh sách từ gốc
  const [sessionQueue, setSessionQueue] = useState([]); // Hàng đợi các từ trong phiên học
  const [currentIndex, setCurrentIndex] = useState(0); // Vị trí hiện tại trong sessionQueue
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [ratingError, setRatingError] = useState(null);
  const [isSessionComplete, setIsSessionComplete] = useState(false);
  const [isRating, setIsRating] = useState(false); // Đang gửi rating lên server
  const [isRated, setIsRated] = useState(false); // Đã rating từ hiện tại chưa

  // Typing mode state
  const [userInput, setUserInput] = useState('');
  const [isAnswerRevealed, setIsAnswerRevealed] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);

    // Kết quả SRS mới nhất (để hiển thị lịch ôn tập tiếp theo)
  const [lastReviewResult, setLastReviewResult] = useState(null);

  // Daily NEW limit (SRS-free sessions are unaffected; this only bounds how many
  // NEW words enter an SRS learning session each day). Persisted per user/day.
  const [dailyNewLimit, setDailyNewLimit] = useState(DEFAULT_DAILY_NEW_LIMIT);
  const [introducedTodaySet, setIntroducedTodaySet] = useState(new Set());

  // Thống kê phiên học
  const [stats, setStats] = useState({
    totalWords: 0,
    correctAnswers: 0,
    needsReview: 0,
    againCount: 0,
    attemptedWords: new Set(),
  });

  const currentWord = useMemo(() => {
    if (sessionQueue.length === 0 || currentIndex >= sessionQueue.length) {
      return null;
    }
    return sessionQueue[currentIndex];
  }, [sessionQueue, currentIndex]);

  // Mode: Flashcard cho 2 lần review đầu, sau đó chuyển sang Typing
  const mode = useMemo(() => {
    if (!currentWord) return 'typing';
    const reviews = currentWord.session_flashcard_reviews ?? currentWord.flashcard_reviews ?? 0;
    return reviews < FLASHCARD_REVIEWS_THRESHOLD ? 'flashcard' : 'typing';
  }, [currentWord]);

  const isFlashcard = mode === 'flashcard';

  // Preview intervals: dự đoán review_due_at cho từng rating button
  const previewIntervals = useMemo(() => {
    if (!currentWord) return {};

    const prog = {
      mastery_level: currentWord.mastery_level ?? 0,
      review_count: currentWord.review_count ?? 0,
      flashcard_reviews: currentWord.flashcard_reviews ?? 0,
      review_due_at: currentWord.review_due_at,
      last_reviewed_at: currentWord.last_reviewed_at ?? null,
      repetitions: currentWord.repetitions ?? 0,
      interval_hours: currentWord.interval_hours ?? 0,
      ease_factor: currentWord.ease_factor ?? 2.5,
      lapses: currentWord.lapses ?? 0,
      state: currentWord.state ?? 'new',
      learning_step: currentWord.learning_step ?? 0,
    };

    const previews = {};
    for (const key of ['again', 'hard', 'good', 'easy']) {
      const rating = RATING_MAP[key];
      const { progress: computed } = computeSrsPayload(prog, rating, {});
      previews[key] = computed?.review_due_at || null;
    }
    return previews;
  }, [currentWord]);

  const loadWords = useCallback(async () => {
    // Reset session state
    setLoading(true);
    setError(null);
    setIsSessionComplete(false);
    setCurrentIndex(0);
    setUserInput('');
    setIsAnswerRevealed(false);
    setIsCorrect(false);
    setIsRated(false);
    setRatingError(null);
    setLastReviewResult(null);
        setStats({
      totalWords: 0,
      correctAnswers: 0,
      needsReview: 0,
      againCount: 0,
      attemptedWords: new Set(),
    });

    // --- Daily NEW quota (SRS sessions only). Fetch the user's limit and the
    //     words they already introduced today so NEW words are capped per-day.
    //     Reviews / learning / relearning words are never limited by this.
    let dailyNewLimit = DEFAULT_DAILY_NEW_LIMIT;
    let introducedTodayIds = [];
    if (user) {
      const limitRes = await getUserDailyNewLimit(user.id);
      dailyNewLimit = limitRes?.value ?? DEFAULT_DAILY_NEW_LIMIT;
      setDailyNewLimit(dailyNewLimit);
      const progRes = await getDailyNewProgress(user.id);
      introducedTodayIds = progRes?.data ?? [];
      setIntroducedTodaySet(new Set(introducedTodayIds));
    }

    try {
      let data, err;

      if (!setId) {
        // Không có setId: tải danh sách từ đến hạn trong review queue
        if (!user) {
          setError('Bạn cần đăng nhập để học.');
          setLoading(false);
          return;
        }
        const result = await getDueReviewWords(user.id);
        data = result.data;
        err = result.error;
      } else {
        // Có setId: tải danh sách từ trong set
        const result = await getWordsInSet(setId);
        data = result.data;
        err = result.error;
      }

      if (err) {
        setError('Không thể tải danh sách từ. Vui lòng thử lại.');
        setLoading(false);
        return;
      }

      if (!data || data.length === 0) {
        setError(setId ? 'Bộ từ này chưa có từ nào để học.' : 'Hiện tại không có từ nào cần ôn tập.');
        setLoading(false);
        return;
      }

      // Sắp xếp: 1. Due, 2. Learning, 3. New
      const now = new Date().toISOString();
      const dueWords = data.filter(
        (w) => w.state !== 'new' && w.review_due_at && w.review_due_at <= now
      );
      const learningWords = data.filter(
        (w) => (w.state === 'learning' || w.state === 'relearning') && w.review_due_at > now
      );
      const newWords = selectNewWordsForToday(
        data.filter((w) => w.state === 'new'),
        dailyNewLimit,
        introducedTodayIds
      );

      // Sắp xếp các từ quá hạn theo thời gian quá hạn lâu nhất
      dueWords.sort((a, b) => new Date(a.review_due_at) - new Date(b.review_due_at));

      const sortedQueue = [...dueWords, ...learningWords, ...newWords];
      // Color coding: 🟢 New = brand-new words, 🟡 Review = words due /
      // in-progress review. A card rated Again later turns 🔴 and is requeued.
      const initialQueue = sortedQueue.map((word) => ({
        ...word,
        againCount: 0,
        sessionStatus: word.state === 'new' ? 'new' : 'review',
      }));

      setAllWords(data);
      setSessionQueue(initialQueue);
      setStats((prev) => ({ ...prev, totalWords: data.length }));
      setLoading(false);
    } catch (e) {
      setError('Đã xảy ra lỗi khi tải danh sách từ. Vui lòng thử lại.');
      setLoading(false);
    }
  }, [setId, user]);

  useEffect(() => {
    loadWords();
  }, [loadWords]);

  // Submit answer in typing mode
  const submitAnswer = useCallback(() => {
    if (!currentWord || isAnswerRevealed) return;

    const userAnswer = userInput.trim().toLowerCase();
    const correctAnswer = currentWord.word.trim().toLowerCase();
    const correct = userAnswer === correctAnswer;

    setIsCorrect(correct);
    setIsAnswerRevealed(true);
  }, [currentWord, userInput, isAnswerRevealed]);

    // Handle rating selection (Again/Hard/Good/Easy)
  const handleRating = useCallback(
    (rating) => {
      if (!currentWord || isRating || isRated) return;

      setIsRating(true);
      setRatingError(null);

      recordProgress(currentWord.id, {
        rating: RATING_MAP[rating],
        isFlashcard,
      }).then(({ progress, error: srsError }) => {
        if (srsError) {
          setRatingError('Không thể lưu tiến trình học. Vui lòng thử lại.');
          setIsRating(false);
          return;
        }

        // Mark the word as introduced today if it's a NEW word.
        // This ensures the daily NEW limit is properly tracked via
        // user_settings + daily_new_progress, and selectNewWordsForToday
        // correctly caps the quota. The upsert is idempotent (onConflict:
        // user_id,day,word_sense_id), so calling it multiple times is safe.
        if (currentWord.state === 'new' && user) {
          markDailyNewIntroduced(user.id, currentWord.word_sense_id ?? currentWord.id).catch(() => {
            // Non-fatal: daily limit may be slightly generous but won't break.
          });
        }

        // Update stats
        setStats((prev) => {
          const newAttempted = new Set(prev.attemptedWords);
          newAttempted.add(currentWord.id);
          const correct = RATING_MAP[rating] >= RATING.HARD;
          return {
            ...prev,
            correctAnswers: prev.correctAnswers + (correct ? 1 : 0),
            needsReview: prev.needsReview + (correct ? 0 : 1),
            attemptedWords: newAttempted,
          };
        });

        // Keep the same word in the local queue until it has completed both
        // flashcard passes and one typing pass.  The returned progress is the
        // source of truth for `flashcard_reviews`, so the next pass switches
        // modes only after the server has accepted the previous rating.
        const updatedWord = {
          ...currentWord,
          ...progress,
          // If the deployed DB has not received the migration yet, keep this
          // count only for the current session. It is incremented only after
          // the compatible database write above succeeds.
          session_flashcard_reviews: isFlashcard
            ? Math.min(
                (currentWord.session_flashcard_reviews ?? currentWord.flashcard_reviews ?? 0) + 1,
                FLASHCARD_REVIEWS_THRESHOLD
              )
            : currentWord.session_flashcard_reviews,
          // The inserted copy is waiting for its early in-session retry.
          sessionStatus: rating === 'again' ? 'review' : 'normal',
          againCount: (currentWord.againCount ?? 0) + (rating === 'again' ? 1 : 0),
        };
        // Every 🔴 Again always requeues the card so it is seen again inside this
        // session. The session therefore cannot finish while a red/pending card exists.
        const shouldRepeatAfterAgain = rating === 'again';

        if (rating === 'again') {
          setStats((prev) => ({ ...prev, againCount: prev.againCount + 1 }));
          // Preserve a red marker on the answered card. The separately queued
          // copy below is yellow because it is waiting to be seen again.
          setSessionQueue((queue) => queue.map((word, index) =>
            index === currentIndex ? { ...word, sessionStatus: 'again' } : word
          ));
        }

        if (rating !== 'again' && currentWord.sessionStatus === 'again') {
          // A successful retry clears the red session marker for every queued
          // instance of this word; it is session-only metadata, not SRS state.
          setSessionQueue((queue) => queue.map((word) =>
            word.id === currentWord.id ? { ...word, sessionStatus: 'normal' } : word
          ));
        }

        if (shouldRepeatAfterAgain) {
          const newQueue = [...sessionQueue];
          // Again is the only rating that requeues a card inside this session.
          // Hard/Good/Easy keep the scheduler's due time and never become Again.
          const insertIndex = Math.min(
            currentIndex + Math.floor(newQueue.length / 3) + 1,
            newQueue.length
          );
          newQueue.splice(insertIndex, 0, updatedWord);
          setSessionQueue(newQueue);
        }

        setLastReviewResult(progress);
        setIsRated(true);
        setIsRating(false);
      }).catch(() => {
        // Keep the current card and its revealed answer intact so the learner
        // can choose a rating again after a transient/network failure.
        setRatingError('Không thể lưu tiến trình học. Vui lòng thử lại.');
        setIsRating(false);
      });
    },
    [currentWord, isRating, isRated, recordProgress, isFlashcard, sessionQueue, currentIndex]
  );

  // Proceed to next word (only after rating or "Again" re-queue)
  const proceedToNext = useCallback(
    (queueLengthOverride) => {
      const queueLen =
        typeof queueLengthOverride === 'number' ? queueLengthOverride : sessionQueue.length;
      const newCurrentIndex = currentIndex + 1;

      // Safety net: the session is only complete when no card ahead of us is
      // still red (🔴 Again) or waiting for an in-session retry (🟡 review).
      const remaining = sessionQueue.slice(newCurrentIndex);
      const hasPendingRetry = remaining.some(
        (w) => w.sessionStatus === 'again' || w.sessionStatus === 'review'
      );

      if (newCurrentIndex >= queueLen && !hasPendingRetry) {
        setIsSessionComplete(true);
        return;
      }

      setCurrentIndex(newCurrentIndex);
      setUserInput('');
      setIsAnswerRevealed(false);
      setIsCorrect(false);
      setIsRated(false);
      setLastReviewResult(null);
      setRatingError(null);
    },
    [currentIndex, sessionQueue.length]
  );

  // Restart the session
  const restartSession = useCallback(() => {
    loadWords();
  }, [loadWords]);

  const exitSession = useCallback(() => {
    // Navigation handled in the UI component
  }, []);

  const progress = useMemo(() => {
    if (sessionQueue.length === 0) return 0;
    return Math.min(100, Math.floor((currentIndex / sessionQueue.length) * 100));
  }, [currentIndex, sessionQueue.length]);

  const wordsRemaining = useMemo(() => {
    return sessionQueue.length - currentIndex;
  }, [currentIndex, sessionQueue.length]);

  // Count only cards still to be answered (from currentIndex onward), grouped
  // by color: 🟢 new / 🟡 review / 🔴 again.
  const sessionStatusCounts = useMemo(() => {
    const remaining = sessionQueue.slice(currentIndex);
    return remaining.reduce(
      (counts, word) => {
        if (word.sessionStatus === 'again') counts.again += 1;
        else if (word.sessionStatus === 'review') counts.review += 1;
        else counts.new += 1;
        return counts;
      },
      { new: 0, again: 0, review: 0 }
    );
  }, [sessionQueue, currentIndex]);

  return {
    loading,
    error,
    ratingError,
    currentWord,
    userInput,
    isAnswerRevealed,
    isCorrect,
    isSessionComplete,
    progress,
    lastReviewResult,
    isRated,
    isRating,
    mode,
    isFlashcard,
    previewIntervals,
    wordsRemaining,
    sessionStatusCounts,
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
