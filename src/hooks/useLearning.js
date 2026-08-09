import { useCallback, useState } from 'react';
import { useAuth } from './useAuth.jsx';
import { getWordsInSet } from '../services/vocabulary.service.js';
import { recordLearningResult } from '../services/learning.service.js';

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
      const result = await getWordsInSet(setId);
      setLoading(false);
      return result;
    },
    []
  );

  /**
   * Ghi nhận kết quả trả lời của một từ.
   * @param {string} wordSenseId
   * @param {{ correct: boolean }} result — correct=true nếu nhớ/đúng, false nếu quên/sai
   */
  const recordProgress = useCallback(
    async (wordSenseId, { correct }) => {
      if (!user) return { progress: null, error: { message: 'Bạn cần đăng nhập.' } };
      return recordLearningResult({ userId: user.id, wordSenseId, correct: !!correct });
    },
    [user]
  );

  return { loadWords, recordProgress, loading };
}
