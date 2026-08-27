import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from './useAuth.jsx';
import {
  getStructureSessionQueue,
  getStructureSrsStats,
  getUserDailyNewStructureLimit,
  getDailyNewStructureProgress,
} from '../services/structure-learning.service.js';
import { partitionStructureQueue } from '../utils/structure-status.js';

const LOAD_ERROR_MESSAGE = 'Không thể tải hàng đợi học cấu trúc. Vui lòng thử lại.';

/**
 * CK7 — Hook cho Structure SRS Queue trong khu học ngắt quãng (/learn).
 *
 * TÁI SỬ DỤNG đúng queue của Structure Learning Session:
 *   getStructureSessionQueue(userId)  -> DUE → LEARNING → NEW
 *   (review chưa tới hạn bị loại; structure chưa có user_structures = NEW,
 *    KHÔNG tạo row chỉ vì load queue).
 *
 * Daily NEW STRUCTURE limit (mirror Vocabulary): queue chỉ nhận số cấu trúc MỚI
 * = daily_new_structure_limit - đã giới thiệu hôm nay. DUE/LEARNING không bị giới hạn.
 *
 * Mirror pattern của useStructures.js — load on mount + expose reload().
 */
export function useStructureLearnQueue() {
  const { user } = useAuth();
  const [queue, setQueue] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!user) {
      setQueue([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Daily NEW structure quota của ngày business hiện tại (Asia/Ho_Chi_Minh).
      // Non-fatal: lỗi đọc setting/progress -> dùng default & 0 đã giới thiệu.
      const [limitRes, progRes, sRes] = await Promise.all([
        getUserDailyNewStructureLimit(user.id),
        getDailyNewStructureProgress(user.id),
        getStructureSrsStats(user.id),
      ]);
      const introducedIds = progRes?.data ?? [];

      const qRes = await getStructureSessionQueue(user.id, {
        dailyNewStructureLimit: limitRes?.value ?? undefined,
        introducedTodayStructureIds: introducedIds,
      });
      if (qRes.error) throw qRes.error;
      setQueue(qRes.data || []);
      // Stats (bộ đếm tổng) là non-fatal: lỗi không chặn hiển thị queue.
      if (!sRes.error && sRes.data) setStats(sRes.data);
    } catch (e) {
      if (import.meta.env.DEV) {
        console.error('[useStructureLearnQueue] load error:', e);
      }
      setQueue([]);
      setError(LOAD_ERROR_MESSAGE);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  // Nhóm DUE / LEARNING / NEW cho UI — pure helper, thứ tự giữ nguyên.
  const sections = useMemo(() => partitionStructureQueue(queue), [queue]);

  return { queue, sections, stats, loading, error, reload: load };
}