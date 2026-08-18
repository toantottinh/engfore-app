import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth.jsx';
import {
  getVocabularySets,
  createVocabularySet,
  updateVocabularySet,
  deleteVocabularySet,
  reorderVocabularySets,
} from '../services/vocabulary.service.js';
import { getAuthErrorMessage } from '../utils/auth-errors.js';

const LOAD_SETS_ERROR_MESSAGE = 'Không thể tải danh sách bộ từ. Vui lòng thử lại.';

/**
 * Hook quản lý bộ từ vựng (danh sách, tạo, sửa, xóa).
 */
export function useVocabulary() {
  const { user } = useAuth();
  const [sets, setSets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mutationLoading, setMutationLoading] = useState(false);

  const load = useCallback(async () => {
    if (!user) {
      setSets([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
const { data, error: err } = await getVocabularySets(user.id);
    if (err) {
      if (import.meta.env.DEV) {
        console.error('[useVocabulary] load sets error:', err);
      }
      setError(LOAD_SETS_ERROR_MESSAGE);
      setSets([]);
    } else {
      setSets(data || []);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const createSet = useCallback(
    async ({ name, description }) => {
      if (!user) return { error: 'Bạn cần đăng nhập để tạo bộ từ.' };
      setMutationLoading(true);
      const { data, error: err } = await createVocabularySet({
        name,
        description,
        userId: user.id,
      });
      setMutationLoading(false);
      if (err) return { error: getAuthErrorMessage(err) };
      await load();
      return { data };
    },
    [user, load]
  );

  const updateSet = useCallback(
    async (setId, updates) => {
      setMutationLoading(true);
      const { data, error: err } = await updateVocabularySet(setId, updates);
      setMutationLoading(false);
      if (err) return { error: getAuthErrorMessage(err) };
      await load();
      return { data };
    },
    [load]
  );

  const removeSet = useCallback(
    async (setId) => {
      setMutationLoading(true);
      const { error: err } = await deleteVocabularySet(setId);
      setMutationLoading(false);
      if (err) return { error: getAuthErrorMessage(err) };
      await load();
      return { error: null };
    },
    [load]
  );

  /**
   * Persist a new learning order for the user's sets (Part B: Word Set
   * Learning Order).  `orderedSetIds` is the desired order (first = highest
   * priority).  Delegates to reorderVocabularySets, which validates that every
   * set belongs to the user, normalizes priorities to 1..N and writes them in
   * one atomic upsert so NEW words from the first set are pulled before later
   * sets.
   *
   * @param {Array<string>} orderedSetIds
   * @returns {Promise<{ error: any }>}
   */
  const reorderSets = useCallback(
    async (orderedSetIds) => {
      if (!user) return { error: 'Bạn cần đăng nhập.' };
      setMutationLoading(true);
      const { error: err } = await reorderVocabularySets(user.id, orderedSetIds);
      setMutationLoading(false);
      if (err) {
        if (import.meta.env.DEV) {
          console.error('[useVocabulary] reorderSets error:', err);
        }
        return { error: getAuthErrorMessage(err) };
      }
      await load();
      return { error: null };
    },
    [user, load]
  );

  return {
    sets,
    loading,
    error,
    mutationLoading,
    load,
    createSet,
    updateSet,
    removeSet,
    reorderSets,
  };
}
