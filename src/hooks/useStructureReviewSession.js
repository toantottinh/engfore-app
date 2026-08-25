import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from './useAuth.jsx';
import { getStructureExercises } from '../services/structure.service.js';
import { recordStructureResult } from '../services/structure-learning.service.js';
import {
  getStructureSessionQueue,
} from '../services/structure-learning.service.js';
import { computeSrsPayload, RATING } from '../services/srs.service.js';
import { checkExerciseAnswer } from '../utils/structure-exercise-checker.js';
import { selectRandomStructureExercise } from '../utils/structure-status.js';

// Map UI rating strings -> SRS rating numbers (giống useLearningSession).
export const RATING_MAP = {
  again: RATING.AGAIN, // 0
  hard: RATING.HARD,   // 2
  good: RATING.GOOD,   // 3
  easy: RATING.EASY,   // 4
};

/**
 * CK10 — STRUCTURE REVIEW SESSION (tự động, giống Vocabulary Review).
 *
 * User KHÔNG chọn structure. Flow:
 *   vào session
 *     -> queue DUE → LEARNING → NEW (getStructureSessionQueue — không đổi)
 *     -> system tự chọn structure kế tiếp
 *     -> random ĐÚNG 1 exercise (selectRandomStructureExercise — không đổi)
 *     -> answer -> feedback (reveal sau submit) -> user rating
 *     -> recordStructureResult() ĐÚNG 1 LẦN
 *     -> TỰ ĐỘNG sang structure tiếp theo (không quay về queue)
 *     -> hết hàng -> completion.
 *
 * Invariants giữ nguyên:
 *   - ONE STRUCTURE = MANY EXERCISES (load bằng structure_id UUID)
 *   - ONE SRS REVIEW = ONE RANDOM EXERCISE
 *   - ONE USER ANSWER = ONE FEEDBACK (correctness ≠ rating)
 *   - ONE USER RATING = ONE STRUCTURE SRS UPDATE (chặn double-submit)
 *   - Exercise bank rỗng -> SKIP structure đó (không crash, không rating,
 *     không ghi SRS); nếu TẤT CẢ đều rỗng -> completion với thông báo riêng.
 */
export function useStructureReviewSession() {
  const { user } = useAuth();

  // Phase: 'loading' | 'exercise' | 'rating' | 'advancing' | 'complete'
  const [phase, setPhase] = useState('loading');
  const [error, setError] = useState(null);

  const [current, setCurrent] = useState(null); // { structure, exercise }
  const [feedback, setFeedback] = useState(null);

  const [isRating, setIsRating] = useState(false);
  const [ratingError, setRatingError] = useState(null);
  const [lastResult, setLastResult] = useState(null);

  // Progress hiển thị: vị trí trong queue + tổng số structure có trong phiên.
  const [position, setPosition] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [completedMessage, setCompletedMessage] = useState('');

  // Refs mirror để handler không bị stale closure khi auto-advance async.
  const queueRef = useRef([]);
  const posRef = useRef(0);
  const currentRef = useRef(null);

  // Preview interval cho từng rating — reuse computeSrsPayload (không hardcode).
  const previewIntervals = useMemo(() => {
    if (!current?.structure) return {};
    const prog = current.structure.user_structures || {};
    const previews = {};
    for (const key of ['again', 'hard', 'good', 'easy']) {
      const { progress: computed } = computeSrsPayload(
        {
          state: prog.state || 'new',
          learning_step: prog.learning_step || 0,
          repetitions: prog.repetitions || 0,
          interval_hours: prog.interval_hours || 0,
          ease_factor: prog.ease_factor ?? 2.5,
          lapses: prog.lapses || 0,
          review_due_at: prog.review_due_at,
          last_reviewed_at: prog.last_reviewed_at || null,
        },
        RATING_MAP[key],
        {}
      );
      previews[key] = computed?.review_due_at || null;
    }
    return previews;
  }, [current]);

  // Duyệt queue từ startIndex: chọn structure ĐẦU TIÊN có ngân hàng exercise.
  // Structure không có bài tập bị SKIP an toàn (C11) — không rating, không SRS.
  const startNextFrom = useCallback(async (list, startIndex, previouslySkipped = 0) => {
    let skipped = previouslySkipped;
    for (let i = startIndex; i < list.length; i += 1) {
      const s = list[i];
      const structureId = s.structureId ?? s.id;
      const res = await getStructureExercises(structureId);
      const bank = !res.error && Array.isArray(res.data) ? res.data : [];
      if (bank.length > 0) {
        posRef.current = i;
        setPosition(i);
        const payload = { structure: s, exercise: selectRandomStructureExercise(bank) };
        currentRef.current = payload;
        setCurrent(payload);
        setFeedback(null);
        setPhase('exercise');
        return { advanced: true, skipped };
      }
      skipped += 1;
      setSkippedCount(skipped);
    }
    return { advanced: false, skipped };
  }, []);

  // Bắt đầu phiên: load queue MỘT lần rồi tự chạy structure đầu tiên.
  const beginSession = useCallback(async () => {
    if (!user) {
      setError('Bạn cần đăng nhập.');
      setPhase('complete');
      return;
    }
    setPhase('loading');
    setError(null);
    setRatingError(null);
    setLastResult(null);
    setFeedback(null);
    setCurrent(null);
    setSkippedCount(0);
    setCompletedMessage('');

    try {
      // Queue đã xếp sẵn DUE → LEARNING → NEW (không đổi scheduler).
      const { data, error: qErr } = await getStructureSessionQueue(user.id);
      if (qErr) throw qErr;
      const list = Array.isArray(data) ? data : [];
      queueRef.current = list;
      setTotalCount(list.length);
      posRef.current = 0;
      setPosition(0);

      const { advanced, skipped } = await startNextFrom(list, 0);
      if (!advanced) {
        setCompletedMessage(
          list.length === 0
            ? 'Chưa có cấu trúc nào để học lúc này.'
            : 'Không có bài tập cấu trúc để học lúc này.'
        );
        setPhase('complete');
      } else {
        setSkippedCount(skipped);
      }
    } catch (e) {
      if (import.meta.env.DEV) {
        console.error('[useStructureReviewSession] load error:', e);
      }
      setError('Không thể tải phiên ôn cấu trúc. Vui lòng thử lại.');
      setPhase('complete');
    }
  }, [user, startNextFrom]);

  useEffect(() => {
    beginSession();
  }, [beginSession]);

  // Nộp câu trả lời cho exercise hiện tại. Correctness CHỈ là feedback —
  // KHÔNG tự map thành rating, KHÔNG đụng SRS ở đây.
  const submitAnswer = useCallback(
    (userAnswer) => {
      const cur = currentRef.current;
      if (!cur || feedback?.submitted) return;
      const result = checkExerciseAnswer(cur.exercise, userAnswer);
      setFeedback({ submitted: true, result, userAnswer });
    },
    [feedback]
  );

  // Sau feedback -> sang rating (vẫn cùng structure).
  const proceedAfterFeedback = useCallback(() => {
    setPhase((p) => (p === 'exercise' ? 'rating' : p));
  }, []);

  // Rating Again/Hard/Good/Easy:
  //   -> recordStructureResult ĐÚNG MỘT LẦN (chặn double-submit)
  //   -> thành công thì TỰ ĐỘNG sang structure kế tiếp trong queue (C9).
  const handleRating = useCallback(
    async (rating) => {
      const cur = currentRef.current;
      if (!user || !cur || isRating) return;
      setIsRating(true);
      setRatingError(null);

      const { progress, error: srsError } = await recordStructureResult({
        userId: user.id,
        structureId: cur.structure.structureId ?? cur.structure.id,
        rating: RATING_MAP[rating],
      });

      if (srsError) {
        setRatingError('Không thể lưu tiến trình học. Vui lòng thử lại.');
        setIsRating(false);
        return;
      }

      setLastResult(progress);
      setIsRating(false);

      // AUTO-NEXT: structure kế tiếp theo queue; hết hàng -> completion.
      setPhase('advancing');
      setCurrent(null);
      currentRef.current = null;
      const { advanced } = await startNextFrom(queueRef.current, posRef.current + 1);
      if (!advanced) {
        setCompletedMessage('');
        setPhase('complete');
      }
    },
    [user, isRating, startNextFrom]
  );

  return {
    phase,
    error,
    loading: phase === 'loading',
    advancing: phase === 'advancing',
    current,
    feedback,
    previewIntervals,
    isRating,
    ratingError,
    lastResult,
    position,
    totalCount,
    skippedCount,
    completedMessage,
    restart: beginSession,
    submitAnswer,
    proceedAfterFeedback,
    handleRating,
  };
}

// Re-export để UI/test dùng một nguồn duy nhất.
export { computeSrsPayload, RATING };


