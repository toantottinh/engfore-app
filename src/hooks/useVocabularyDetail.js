import {
  getVocabularySet,
  getWordsInSet,
  addWordToSet,
  deleteWordFromSet,
  updateVocabularySet,
  adminDeleteWord, // For global deletion by admins
  removeFromVocabulary as serviceRemoveFromVocabulary,
} from '../services/vocabulary.service.js';
import { getAuthErrorMessage } from '../utils/auth-errors.js';

/**
 * Hook quản lý chi tiết một bộ từ vựng (thông tin set, danh sách từ, và các thao tác CRUD trên từ).
 * @param {string} setId - ID của bộ từ.
 */
export function useVocabularyDetail(setId) {
  const [set, setSet] = useState(null);
  const [words, setWords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mutationLoading, setMutationLoading] = useState(false);

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
        getWordsInSet(setId),
      ]);

      if (setResult.error || wordsResult.error) {
        const err = setResult.error || wordsResult.error;
        if (import.meta.env.DEV) console.error('[useVocabularyDetail] Load error:', err);
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
  }, [setId]);

  useEffect(() => {
    loadSetAndWords();
  }, [loadSetAndWords]);

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
      const { error: err } = await deleteWordFromSet(setId, wordSenseId);
      setMutationLoading(false);
      if (err) return { error: getAuthErrorMessage(err) };
      await loadSetAndWords();
      return { error: null };
    },
    [setId, loadSetAndWords]
  );
  
  const deleteSystemWord = useCallback(
    async (wordId) => {
      setMutationLoading(true);
      const { error: err } = await adminDeleteWord(wordId);
      setMutationLoading(false);
      if (err) return { error: getAuthErrorMessage(err) };
      await loadSetAndWords();
      return { error: null };
    },
    [loadSetAndWords]
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

  /**
   * Removes a word from the user's entire vocabulary library.
   * This is a global removal, not just from the current set.
   */
  const removeFromVocabulary = useCallback(
    async (wordSenseId) => {
      setMutationLoading(true);
      const { error: err } = await serviceRemoveFromVocabulary(wordSenseId);
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
    deleteSystemWord,
    removeFromVocabulary,
    updateSetDetails,
  };
}