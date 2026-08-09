import { useCallback, useState } from 'react';
import { useAuth } from './useAuth.jsx';
import { getWordsInSet } from '../services/vocabulary.service.js';
import { updateWordProgress } from '../services/learning.service.js';

/**
 * Hook quản lý các hoạt động luyện tập (typing, flashcard).
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

  const recordProgress = useCallback(
    async (wordSenseId, { correct, recall }) => {
      if (!user) return { error: 'Bạn cần đăng nhập.' };
      return updateWordProgress(wordSenseId, user.id, { correct, recall });
    },
    [user]
  );

  return { loadWords, recordProgress, loading };
}

