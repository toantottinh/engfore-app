import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth.jsx';
import { getStructuresForUser } from '../services/structure.service.js';

const LOAD_ERROR_MESSAGE = 'Không thể tải cấu trúc câu. Vui lòng thử lại.';

/**
 * Hook quản lý danh sách Sentence Structures (kèm trạng thái học của user).
 * Mirror pattern của useVocabulary.js — load on mount + expose load().
 */
export function useStructures() {
  const { user } = useAuth();
  const [structures, setStructures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!user) {
      setStructures([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: err } = await getStructuresForUser(user.id);
    if (err) {
      if (import.meta.env.DEV) {
        console.error('[useStructures] load error:', err);
      }
      setError(LOAD_ERROR_MESSAGE);
      setStructures([]);
    } else {
      setStructures(data || []);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  return { structures, loading, error, load };
}