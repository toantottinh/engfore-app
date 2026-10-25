import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase.js';

const DEFAULT_WORD_QUOTA = 500;

/**
 * Hook quản lý hạn mức từ vựng (word quota) và trạng thái tắt quảng cáo.
 *
 * - Lấy user từ Supabase auth.
 * - Query bảng `profiles`: word_quota, ad_free_until.
 * - Đếm số từ hiện có: SELECT count(*) FROM words WHERE user_id = user.id.
 */
export function useUserPlan() {
  const [user, setUser] = useState(null);
  const [wordQuota, setWordQuota] = useState(DEFAULT_WORD_QUOTA);
  const [adFreeUntil, setAdFreeUntil] = useState(null);
  const [currentWordsCount, setCurrentWordsCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Lấy user từ Supabase auth (session + getUser fallback) + lắng nghe thay đổi.
  useEffect(() => {
    let mounted = true;

    const loadUser = async () => {
      try {
        if (typeof supabase?.auth?.getSession === 'function') {
          const { data } = await supabase.auth.getSession();
          if (!mounted) return;
          if (data?.session?.user) {
            setUser(data.session.user);
            return;
          }
        }
      } catch {
        // ignore
      }
      try {
        if (typeof supabase?.auth?.getUser === 'function') {
          const { data } = await supabase.auth.getUser();
          if (!mounted) return;
          if (data?.user) setUser(data.user);
        }
      } catch {
        // ignore
      }
    };

    loadUser();

    let subscription;
    try {
      if (typeof supabase?.auth?.onAuthStateChange === 'function') {
        const res = supabase.auth.onAuthStateChange((_event, session) => {
          if (!mounted) return;
          setUser(session?.user ?? null);
        });
        subscription = res?.data?.subscription;
      }
    } catch {
      // ignore
    }

    return () => {
      mounted = false;
      subscription?.unsubscribe?.();
    };
  }, []);

  const fetchPlan = useCallback(async () => {
    if (!user?.id) {
      setWordQuota(DEFAULT_WORD_QUOTA);
      setAdFreeUntil(null);
      setCurrentWordsCount(0);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Query profile
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('word_quota, ad_free_until')
          .eq('id', user.id)
          .maybeSingle();
        if (profile) {
          if (profile.word_quota != null) setWordQuota(Number(profile.word_quota));
          else setWordQuota(DEFAULT_WORD_QUOTA);
          setAdFreeUntil(profile.ad_free_until ?? null);
        } else {
          setWordQuota(DEFAULT_WORD_QUOTA);
          setAdFreeUntil(null);
        }
      } catch {
        setWordQuota(DEFAULT_WORD_QUOTA);
        setAdFreeUntil(null);
      }

      // Đếm số từ hiện có
      try {
        const { count } = await supabase
          .from('words')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id);
        setCurrentWordsCount(count ?? 0);
      } catch {
        setCurrentWordsCount(0);
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchPlan();
  }, [fetchPlan]);

  const remainingQuota = (wordQuota ?? DEFAULT_WORD_QUOTA) - (currentWordsCount ?? 0);
  const isAdFree = !!adFreeUntil && new Date(adFreeUntil) > new Date();
  const shortUserId = user?.id ? String(user.id).slice(0, 6) : '';

  return {
    user,
    wordQuota: wordQuota ?? DEFAULT_WORD_QUOTA,
    currentWordsCount: currentWordsCount ?? 0,
    remainingQuota,
    isAdFree,
    shortUserId,
    loading,
    refetchPlan: fetchPlan,
  };
}

export default useUserPlan;
