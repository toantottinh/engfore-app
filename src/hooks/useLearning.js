import { useCallback, useState } from 'react';
import { useAuth } from './useAuth.jsx';
import { getWordsInSet } from '../services/vocabulary.service.js';
import {
  getVocabularyStats as fetchVocabularyStats,
  recordLearningResult,
} from '../services/learning.service.js';

/**
 * Hook quản lý các hoạt động luyện tập (typing, flashcard).
 *
 * Mọi kết quả trả lời đều đi qua `recordLearningResult` (single source of truth
 * trong learning.service.js) — Flashcard, Typing và Review dùng chung:
 *   - correct  -> mastery +1
 *   - incorrect -> mastery -1
 *   - review_due_at tính theo interval [4, 8, 24, 72, 168, 336] giờ.
 */
export function useLearning() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  const loadWords = useCallback(
    async (setId) => {
      setLoading(true);
      const result = await getWordsInSet(setId, user?.id);
      setLoading(false);
      return result;
    },
    [user?.id]
  );

  /**
   * Ghi nhận kết quả trả lời của một từ.
   * Accepts either { correct } (legacy) or { rating } with FSRS ratings.
   * @param {string} wordSenseId
   * @param {{ correct?: boolean, rating?: number | string }} result
   */
  const recordProgress = useCallback(
    async (wordSenseId, { correct, rating, isFlashcard } = {}) => {
      if (!user) return { progress: null, error: { message: 'Bạn cần đăng nhập.' } };
      // If rating string provided (e.g., 'AGAIN'/'GOOD'), pass it through.
      if (typeof rating !== 'undefined') {
        return recordLearningResult({ userId: user.id, wordSenseId, rating, isFlashcard: !!isFlashcard });
      }
      // Fallback to legacy boolean
      return recordLearningResult({ userId: user.id, wordSenseId, correct: !!correct, isFlashcard: !!isFlashcard });
    },
    [user]
  );

  // Practice-only record: does NOT update SRS. Returns a resolved shape similar
  // to recordLearningResult but without persisting changes to user_progress.
  const recordPracticeAnswer = useCallback(async (wordSenseId, { correct, rating } = {}) => {
    // For practice we do not call recordLearningResult to avoid changing SRS state.
    // Return a neutral response so callers can continue without error.
    return { progress: null, error: null };
  }, []); 

  const getVocabularyStats = useCallback(async () => {
    if (!user) return { data: null, error: { message: 'Bạn cần đăng nhập.' } };
    return fetchVocabularyStats(user.id);
  }, [user]);

  return { loadWords, recordProgress, recordPracticeAnswer, getVocabularyStats, loading };
}
