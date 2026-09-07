import { useState, useEffect, useCallback } from 'react';
import {
  getVocabularySet,
  getWordsInSet,
  addWordToSet,
  removeWordFromSet as serviceRemoveWordFromSet,
  removeWordsFromSet as serviceRemoveWordsFromSet,
  updateUserVocabularyWord,
  updateVocabularySet,
} from '../services/vocabulary.service.js';
import { getAuthErrorMessage } from '../utils/auth-errors.js';
import { useAuth } from './useAuth.jsx';

/**
 * Hook quản lý chi tiết một bộ từ vựng (thông tin set, danh sách từ, và các thao tác CRUD trên từ).
 * @param {string} setId - ID của bộ từ.
 */
export function useVocabularyDetail(setId) {
  const { user } = useAuth();
  const [set, setSet] = useState(null);
  const [words, setWords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mutationLoading, setMutationLoading] = useState(false);
  const [selectedWordSenseIds, setSelectedWordSenseIds] = useState([]);

  const loadSetAndWords = useCallback(async () => {
    if (!setId) {
      setLoading(false);
      setError('Không tìm thấy ID bộ từ.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [setResult, wordsResult] = await Promise.all([
        getVocabularySet(setId),
        getWordsInSet(setId, user?.id),
      ]);

      if (setResult.error || wordsResult.error) {
        const err = setResult.error || wordsResult.error;
        // Log đầy đủ response từ Supabase để xác định chính xác nguyên nhân
        // (HTTP 400 do URL/`.in()` quá lớn, RPC thiếu, RLS, ...) — chỉ khi DEV.
        if (import.meta.env.DEV) {
          console.error(
            '[useVocabularyDetail] Load error:',
            JSON.stringify(
              {
                message: err?.message ?? null,
                code: err?.code ?? null,
                status: err?.status ?? null,
                details: err?.details ?? null,
                hint: err?.hint ?? null,
                cause: err?.cause ?? null,
              },
              null,
              2
            )
          );
        }
        setError('Không thể tải dữ liệu bộ từ. Vui lòng thử lại.');
        setSet(null);
        setWords([]);
      } else {
        setSet(setResult.data);
        setWords(wordsResult.data || []);
      }
    } catch (e) {
      setError('Đã xảy ra lỗi không mong muốn.');
    } finally {
      setLoading(false);
    }
  }, [setId, user?.id]);

  useEffect(() => {
    loadSetAndWords();
  }, [loadSetAndWords]);

  // Đổi Set (hoặc reload do setId thay đổi) → reset selection để tránh xóa nhầm.
  useEffect(() => {
    setSelectedWordSenseIds([]);
  }, [setId]);

  const addWord = useCallback(
    async (wordData) => {
      setMutationLoading(true);
      const { error: err } = await addWordToSet(setId, wordData);
      setMutationLoading(false);
      if (err) return { error: getAuthErrorMessage(err) };
      await loadSetAndWords();
      return { error: null };
    },
    [setId, loadSetAndWords]
  );

  const removeWordFromSet = useCallback(
    async (wordSenseId) => {
      setMutationLoading(true);
      // Chỉ bỏ membership của word khỏi Word Set hiện tại. KHÔNG xóa
      // user_vocabulary / user_progress — từ vẫn còn ở Kho từ + SRS.
      // RPC tự xác thực auth.uid() — không truyền userId từ frontend.
      const { error: err } = await serviceRemoveWordFromSet({ setId, wordSenseId });
      setMutationLoading(false);
      if (err) return { error: getAuthErrorMessage(err) };
      await loadSetAndWords();
      return { error: null };
    },
    [setId, loadSetAndWords]
  );

  // --- Selection state cho bulk actions ---
  const toggleWordSelection = useCallback((wordSenseId) => {
    setSelectedWordSenseIds((prev) =>
      prev.includes(wordSenseId)
        ? prev.filter((id) => id !== wordSenseId)
        : [...prev, wordSenseId]
    );
  }, []);

  const selectAllWords = useCallback((allWordSenseIds) => {
    setSelectedWordSenseIds(allWordSenseIds);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedWordSenseIds([]);
  }, []);

  const removeSelectedWords = useCallback(
    async (wordSenseIds) => {
      setMutationLoading(true);
      // Bulk unlink: chỉ gỡ membership (set_words) của các từ đã chọn.
      // KHÔNG xóa user_vocabulary / user_progress — từ VẪN còn ở Kho từ + SRS.
      // RPC tự xác thực auth.uid() — không truyền userId từ frontend.
      const { error: err } = await serviceRemoveWordsFromSet({ setId, wordSenseIds });
      setMutationLoading(false);
      if (err) return { error: getAuthErrorMessage(err) };
      setSelectedWordSenseIds([]);
      await loadSetAndWords();
      return { error: null };
    },
    [setId, loadSetAndWords]
  );

  const updateSetDetails = useCallback(
    async (updates) => {
      setMutationLoading(true);
      const { error: err } = await updateVocabularySet(setId, updates);
      setMutationLoading(false);
      if (err) return { error: getAuthErrorMessage(err) };
      await loadSetAndWords();
      return { error: null };
    },
    [setId, loadSetAndWords]
  );

  // --- Edit word (user-owned content qua RPC update_user_word_content) ---
  // Chỉ cập nhật example/memory_clue trong user_vocabulary của chính user —
  // KHÔNG update global dictionary, KHÔNG đụng SRS.
  const updateWord = useCallback(
    async (senseId, updates = {}) => {
      setMutationLoading(true);
      const { error: err } = await updateUserVocabularyWord({
        wordSenseId: senseId,
        example: updates.example ?? null,
        memoryClue: updates.memoryClue ?? null,
      });
      setMutationLoading(false);
      if (err) return { error: getAuthErrorMessage(err) };
      await loadSetAndWords();
      return { error: null };
    },
    [loadSetAndWords]
  );

  return {
    set,
    words,
    loading,
    error,
    mutationLoading,
    loadSetAndWords,
    addWord,
    removeWordFromSet,
    updateSetDetails,
    updateWord,
    selectedWordSenseIds,
    toggleWordSelection,
    selectAllWords,
    clearSelection,
    removeSelectedWords,
  };
}