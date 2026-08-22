import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from './useAuth.jsx';
import { getWordsInSet } from '../services/vocabulary.service.js';
import {
  getDueReviewWords,
  FLASHCARD_REVIEWS_THRESHOLD,
  getUserDailyNewLimit,
  getDailyNewProgress,
  markDailyNewIntroduced,
  getLearnSessionQueue,
  getVocabularyStats,
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

// Session display states (per unique word). One word is always in exactly one.
export const SESSION_STATE = {
  NEW: 'new',      // 🟢 Mới
  REVIEW: 'review', // 🟠 Ôn
  AGAIN: 'again',  // 🔴 Again
  DONE: 'done',    // left the counters
};

/**
 * Resolve the next session display state for a word after a rating.
 * Pure (no I/O) so the transition matrix can be unit-tested directly.
 *
 * Rules:
 *  - rating === 'again' (NEW→AGAIN / REVIEW→AGAIN / AGAIN→AGAIN):
 *    the word lands / stays in the red bucket exactly once. A repeated Again
 *    NEVER increments the Again count for the same word.
 *  - A REVIEW (🟠 Ôn) word answered correctly (Hard/Good/Easy) has been
 *    successfully reviewed and is no longer pending this session, so it leaves
 *    the yellow bucket ('done'). This mirrors the REVIEW→AGAIN path (Ôn -1,
 *    Again +1) for success ratings (Ôn -1, Again untouched).
 *  - An Again word answered correctly (Hard/Good/Easy) leaves the red bucket
 *    ('done'); it is not moved into 🟢 Mới or 🟠 Ôn.
 *  - A NEW word answered correctly stays 🟢 Mới (still part of the new batch).
 *    Non-REVIEW cards are never decremented from the Ôn counter.
 *
 * @param {string} currentState 'new' | 'review' | 'again' | 'done' (may be empty)
 * @param {string} rating UI rating key: 'again' | 'hard' | 'good' | 'easy'
 * @param {string} fallbackState state to use when currentState is unknown
 * @returns {string} next state
 */
export function resolveSessionWordState(currentState, rating, fallbackState = SESSION_STATE.REVIEW) {
  const base = currentState || fallbackState;
  if (rating === 'again') return SESSION_STATE.AGAIN;
  if (base === SESSION_STATE.AGAIN) return SESSION_STATE.DONE;
  // REVIEW answered correctly → successfully reviewed → leaves the yellow bucket.
  if (base === SESSION_STATE.REVIEW) return SESSION_STATE.DONE;
  return base;
}

/**
 * Aggregate a per-word display-state map into the three display counters
 * (🟢 Mới / 🔴 Again / 🟠 Ôn). Words in the 'done' state fall out entirely.
 * @param {Record<string,string>} states map of wordState (word id -> state)
 * @returns {{new:number, again:number, review:number}}
 */
export function countSessionStates(states) {
  const counts = { new: 0, again: 0, review: 0 };
  for (const state of Object.values(states)) {
    if (state === SESSION_STATE.AGAIN) counts.again += 1;
    else if (state === SESSION_STATE.REVIEW) counts.review += 1;
    else if (state === SESSION_STATE.NEW) counts.new += 1;
  }
  return counts;
}

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
  // `noWords` = recoverable "queue empty, NO hard error" (e.g. LIMITED daily NEW
  // quota exhausted while NEW words still exist). Shown TOGETHER with the mode
  // toggle so the user can switch to UNLIMITED. Genuine RPC/network failures
  // still go through `error` (renders the hard-error Alert).
  const [noWords, setNoWords] = useState(null);
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

  // Learn mode: LIMITED (NEW capped by daily quota) | UNLIMITED (no NEW cap).
  // This is the user-facing mode selector, separate from the internal
  // flashcard/typing `mode` below.
  // Persist learnMode across remounts (/learn -> /learn/session/:setId or a
  // refresh) so the chosen mode is NEVER lost between navigations. Stored in
  // sessionStorage (per-tab, cleared on browser close); defaults to LIMITED.
  const [learnMode, setLearnModeState] = useState(() => {
    try {
      const saved =
        typeof window !== 'undefined'
          ? window.sessionStorage.getItem('engfore.learnMode')
          : null;
      return saved === 'UNLIMITED' ? 'UNLIMITED' : 'LIMITED';
    } catch {
      return 'LIMITED';
    }
  });
  // Keep the same call signature the component already uses:
  // setLearnMode('LIMITED' | 'UNLIMITED'). Writes persist + notify state.
  const setLearnMode = useCallback((next) => {
    setLearnModeState(next);
    try {
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem('engfore.learnMode', next);
      }
    } catch {}
  }, []);

  // Thống kê vốn từ của user — Tổng cộng / Đang học / Từ mới.
  // Lấy từ RPC get_user_vocabulary_stats (đếm ở DB, không tải toàn bộ từ về client).
  const [vocabularyStats, setVocabularyStats] = useState({ total: 0, learning: 0, new: 0 });

  // Thống kê phiên học
  const [stats, setStats] = useState({
    totalWords: 0,
    correctAnswers: 0,
    needsReview: 0,
    againCount: 0,
    attemptedWords: new Set(),
  });

  // Session display-state per product word (key = word id). This is the
  // SINGLE SOURCE OF TRUTH for the 🟢 Mới / 🔴 Again / 🟠 Ôn counters. One
  // unique word is always in exactly one state:
  //   'new'    -> 🟢 Mới (never moved to Again this session)
  //   'review' -> 🟠 Ôn (review group)
  //   'again'  -> 🔴 Again (currently needs an in-session retry)
  //   'done'   -> left the counters (e.g. an Again word answered correctly).
  // This is SEPARATE from the per-instance `sessionStatus` on the queue,
  // which only drives requeue + completion detection (duplicates allowed).
  const [sessionWordStates, setSessionWordStates] = useState({});

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

  // Làm mới thống kê vốn từ của user (Tổng cộng / Đang học / Từ mới) từ DB.
  // Tái sử dụng RPC get_user_vocabulary_stats hiện có; đếm ở database layer.
  const refreshVocabularyStats = useCallback(async () => {
    if (!user) return;
    try {
      const res = await getVocabularyStats(user.id);
      if (res?.error || !res?.data) return;
      const total = Number(res.data.total_count) || 0;
      const learning = Number(res.data.learning_count) || 0;
      setVocabularyStats({ total, learning, new: Math.max(total - learning, 0) });
    } catch (e) {
      // Non-fatal: giữ số liệu hiện tại nếu không đọc được thống kê.
    }
  }, [user]);

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

    // Luôn làm mới thống kê vốn từ từ DB khi bắt đầu phiên học.
    refreshVocabularyStats();

      // --- Unified Learn Engine: Learn Queue Policy ---
    // Modes: LIMITED | UNLIMITED (default: LIMITED for safety).
    // - LIMITED: NEW words capped by daily_new_limit - already_introduced_today.
    // - UNLIMITED: NEW words without daily cap.
    // Priority: default queue order DUE → LEARNING → NEW (always).
    // Set learn_priority (user-specific) applies to NEW candidate order:
    //   lower learn_priority = higher priority in NEW selection.
    //   If set has no preference → priority = 1 (highest).
    // Parameters from caller: learnMode (state), setId (if omitted → whole vocab).
    let dailyNewLimit = DEFAULT_DAILY_NEW_LIMIT;
    let introducedTodayIds = [];
    if (user) {
      const limitRes = await getUserDailyNewLimit(user.id);
      dailyNewLimit = limitRes?.value ?? DEFAULT_DAILY_NEW_LIMIT;
      setDailyNewLimit(dailyNewLimit);
      const progRes = await getDailyNewProgress(user.id);
      if (progRes?.error && import.meta.env.DEV) {
        console.warn('[useLearningSession] getDailyNewProgress error:', progRes.error);
      }
      introducedTodayIds = progRes?.data ?? [];
      setIntroducedTodaySet(new Set(introducedTodayIds));
    }

    try {
      const { queue, error: queueError } = await getLearnSessionQueue(user.id, {
        learnMode,
        setId,
        dailyNewLimit,
        introducedTodayCount: introducedTodayIds.length,
      });

      if (queueError) {
        throw queueError;
      }

      if (!queue || queue.length === 0) {
        setError(null);
        setNoWords(setId ? 'Bộ từ này chưa có từ nào để học.' : 'Hiện tại không có từ nào cần ôn tập. Quay lại sau nhé!');
        setSessionQueue([]);
        setAllWords([]);
        setSessionWordStates({});
        setLoading(false);
        return;
      }

      // Color coding: 🟢 New = brand-new words, 🟡 Review = words due /
      // in-progress review. A card rated Again later turns 🔴 and is requeued.
      const initialQueue = queue.map((word) => ({
        ...word,
        againCount: 0,
        sessionStatus: word.state === 'new' ? 'new' : 'review',
      }));

      // Build the initial per-word display-state map used by the counters.
      const initialStates = {};
      initialQueue.forEach((word) => {
        initialStates[word.id] = word.state === 'new' ? 'new' : 'review';
      });
      setSessionWordStates(initialStates);

      setAllWords(initialQueue); // allWords is now the session queue
      setSessionQueue(initialQueue);
      setNoWords(null);
      setError(null);
      setStats((prev) => ({ ...prev, totalWords: initialQueue.length }));
      setLoading(false);
    } catch (e) {
      setNoWords(null);
      setError('Đã xảy ra lỗi khi tải phiên học. Vui lòng thử lại.');
      setLoading(false);
    }
    }, [setId, user, learnMode, refreshVocabularyStats]);

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
          const senseId = currentWord.word_sense_id ?? currentWord.id;
          markDailyNewIntroduced(user.id, senseId)
            .then(() => {
              // Optimistically update the introduced-today set so the
              // "Từ mới hôm nay" counter reflects the just-introduced word
              // WITHOUT requiring a full page reload.
              setIntroducedTodaySet((prev) => new Set([...prev, senseId]));
            })
            .catch(() => {
              // Non-fatal: daily limit may be slightly generous but won't break.
            });
          // Một từ NEW đã được đưa vào user_progress → Đang học +1, Từ mới -1.
          refreshVocabularyStats();
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

        // Update the per-word display state (independent of queue requeue).
        // rating === 'again' covers every path with the semantic
        // "current word -> Again" (Flashcard Again button, Typing wrong +
        // Again, keyboard 1, ...). Non-again ratings on an Again word mean
        // the retry succeeded -> it leaves the red bucket ('done'). A REVIEW
        // word answered with Hard/Good/Easy was successfully reviewed -> it
        // leaves the yellow bucket so the Ôn counter decrements by 1.
        setSessionWordStates((prev) => {
          const initialForWord = currentWord.state === 'new' ? 'new' : 'review';
          const currentState = prev[currentWord.id] ?? initialForWord;
          const nextState = resolveSessionWordState(currentState, rating, initialForWord);
          if (nextState === currentState) return prev;
          return { ...prev, [currentWord.id]: nextState };
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
    [currentWord, isRating, isRated, recordProgress, isFlashcard, sessionQueue, currentIndex, refreshVocabularyStats]
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

  // Session display counters — number of UNIQUE words currently in each state
  // (🟢 Mới / 🔴 Again / 🟠 Ôn). Derived from the per-word map so a word that
  // is requeued (duplicated in the queue) is still counted exactly once.
  // 'done' words intentionally fall out of all three buckets.
  const sessionStatusCounts = useMemo(() => countSessionStates(sessionWordStates), [sessionWordStates]);

  return {
    loading,
    error,
    noWords,
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
    learnMode,
    setLearnMode,
    dailyNewLimit,
    introducedTodayCount: introducedTodaySet.size,
    previewIntervals,
    wordsRemaining,
    sessionStatusCounts,
    stats,
    vocabularyStats,
    setUserInput,
    submitAnswer,
    handleRating,
    proceedToNext,
    restartSession,
    exitSession,
    sessionQueueLength: sessionQueue.length,
  };
}
