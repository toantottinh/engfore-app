import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from './useAuth.jsx';
import { getStructureById, getStructureExercises } from '../services/structure.service.js';
import { recordStructureResult } from '../services/structure-learning.service.js';
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
 * Hook điều khiển phiên học MỘT Structure (CHECKPOINT 8):
 *
 *   intro -> RANDOM ĐÚNG 1 exercise -> answer -> feedback
 *         -> user tự rating Structure -> complete
 *
 * Invariants (CK8):
 *   - ONE STRUCTURE = MANY EXERCISES: load exercises bằng
 *     `.eq('structure_id', structureId)` (UUID — KHÔNG dùng pattern).
 *   - ONE SRS OCCURRENCE = ONE RANDOM EXERCISE: mỗi phiên chọn ngẫu nhiên
 *     ĐÚNG MỘT bài (random thuần — được phép lặp bài cũ, KHÔNG history /
 *     tracking / weighted / balancing).
 *   - ONE EXERCISE RESULT = ONE STRUCTURE RATING: correctness của exercise
 *     CHỈ là feedback; SRS rating do USER chọn Again/Hard/Good/Easy.
 *   - ONE STRUCTURE RATING = ONE SRS UPDATE: recordStructureResult gọi ĐÚNG
 *     1 lần, payload { userId, structureId, rating } — không exercise_id.
 *   - Exercise bank rỗng -> phase 'no-exercises': KHÔNG random, KHÔNG rating,
 *     KHÔNG ghi SRS chỉ vì mở session.
 *   - Sau rating: complete. KHÔNG có "structure kế tiếp" trong cùng session;
 *     queue reload khi user quay lại /learn/structures (load-on-mount).
 *
 * @param {string} structureId
 */
export function useStructureSession(structureId) {
  const { user } = useAuth();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [structure, setStructure] = useState(null); // detail + progress
  const [exercises, setExercises] = useState([]); // ngân hàng bài tập

  // Exercise duy nhất của phiên này — random MỘT LẦC khi load xong bank.
  const [currentExercise, setCurrentExercise] = useState(null);

  // Phase: 'intro' | 'exercise' | 'rating' | 'complete' | 'no-exercises'
  const [phase, setPhase] = useState('intro');
  const [feedback, setFeedback] = useState(null); // { submitted: bool, result: {...} }

  // Rating state
  const [isRating, setIsRating] = useState(false);
  const [ratingError, setRatingError] = useState(null);
  const [lastReviewResult, setLastReviewResult] = useState(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      setPhase('intro');
      setFeedback(null);
      setLastReviewResult(null);
      setRatingError(null);
      setStructure(null);
      setExercises([]);
      setCurrentExercise(null);

      if (!user || !structureId) {
        if (active) {
          setError('Thiếu thông tin phiên học.');
          setLoading(false);
        }
        return;
      }

      try {
        // Load structure + NGÂN HÀNG EXERCISE bằng structureId (UUID).
        // KHÔNG load queue ở đây nữa: session chỉ phục vụ MỘT structure,
        // một lần SRS occurrence rồi kết thúc (CK8).
        const [dRes, exRes] = await Promise.all([
          getStructureById(structureId),
          getStructureExercises(structureId),
        ]);

        if (!active) return;
        if (dRes.error) throw dRes.error;
        if (exRes.error) throw exRes.error;

        const bank = exRes.data || [];
        setStructure(dRes.data);
        setExercises(bank);
        // Random đúng MỘT exercise cho cả phiên — chọn 1 lần, giữ nguyên.
        setCurrentExercise(selectRandomStructureExercise(bank));
      } catch (e) {
        if (active) {
          if (import.meta.env.DEV) {
            console.error('[useStructureSession] load error:', e);
          }
          setError('Không thể tải phiên học. Vui lòng thử lại.');
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [structureId, user]);

  // Preview interval cho từng rating — reuse computeSrsPayload (không hardcode).
  const previewIntervals = useMemo(() => {
    if (!structure) return {};
    const prog = structure.user_structures || {};
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
  }, [structure]);

  // Bắt đầu phiên (sau intro). Bank rỗng -> KHÔNG random, KHÔNG rating:
  // báo "Chưa có bài tập" và DỪNG — không ghi SRS chỉ vì mở session.
  const startSession = useCallback(() => {
    if (!currentExercise) {
      setPhase('no-exercises');
      return;
    }
    setPhase('exercise');
    setFeedback(null);
  }, [currentExercise]);

  // Nộp câu trả lời cho exercise duy nhất của phiên.
  // Correctness chỉ dùng làm FEEDBACK — không tự map thành SRS rating.
  const submitAnswer = useCallback(
    (userAnswer) => {
      if (!currentExercise || feedback?.submitted) return;
      const result = checkExerciseAnswer(currentExercise, userAnswer);
      // userAnswer đi kèm để feedback hiển thị lại "Câu trả lời của bạn".
      setFeedback({ submitted: true, result, userAnswer });
    },
    [currentExercise, feedback]
  );

  // Sau feedback -> sang rating (KHÔNG còn "exercise kế tiếp" trong phiên).
  const proceedAfterFeedback = useCallback(() => {
    if (phase !== 'exercise') return;
    setPhase('rating');
    setFeedback(null);
  }, [phase]);

  // Rating Again/Hard/Good/Easy -> ghi SRS ĐÚNG MỘT LẦN (recordStructureResult).
  const handleRating = useCallback(
    async (rating) => {
      if (!user || !structure || isRating) return;
      setIsRating(true);
      setRatingError(null);
      const { progress, error: srsError } = await recordStructureResult({
        userId: user.id,
        structureId: structure.id,
        rating: RATING_MAP[rating],
      });
      if (srsError) {
        setRatingError('Không thể lưu tiến trình học. Vui lòng thử lại.');
        setIsRating(false);
        return;
      }
      setLastReviewResult(progress);
      setPhase('complete');
      setIsRating(false);
    },
    [user, structure, isRating]
  );

  return {
    loading,
    error,
    structure,
    exercises,
    exerciseCount: exercises.length,
    currentExercise,
    phase,
    feedback,
    previewIntervals,
    isRating,
    ratingError,
    lastReviewResult,
    startSession,
    submitAnswer,
    proceedAfterFeedback,
    handleRating,
  };
}

// Re-export để UI/test dùng một nguồn duy nhất.
export { computeSrsPayload, RATING };

