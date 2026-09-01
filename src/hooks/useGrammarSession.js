import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from './useAuth.jsx';
import { getGrammarRuleById, getGrammarExercisesByRule } from '../services/grammar.service.js';
import { recordGrammarResult } from '../services/grammar-learning.service.js';
import { computeSrsPayload, RATING } from '../services/srs.service.js';
import { checkExerciseAnswer } from '../utils/structure-exercise-checker.js';
import { resolveGrammarExercisePlan } from '../utils/grammar-status.js';

// Map UI rating strings -> SRS rating numbers (giống useStructureSession —
// cùng rating model AGAIN/HARD/GOOD/EASY cho toàn EngFore).
export const RATING_MAP = {
  again: RATING.AGAIN, // 0
  hard: RATING.HARD,   // 2
  good: RATING.GOOD,   // 3
  easy: RATING.EASY,   // 4
};

/**
 * Hook điều khiển phiên học MỘT Grammar Rule — mirror useStructureSession,
 * tái sử dụng nguyên	ví exercise engine hiện có:
 *
 *   intro -> kế hoạch THEO SRS STATE của rule (resolveGrammarExercisePlan =
 *   resolveStructureExercisePlan — generic trên (progress, bank)):
 *     NEW / AGAIN  : SEQUENCE tối đa 6 bài theo thứ tự ổn định, xong bài này
 *                    mới sang bài kế, rating CHỈ sau bài cuối.
 *     review + last_rating AGAIN/HARD/không rõ : RANDOM ĐÚNG 1 exercise guided.
 *     review + last_rating GOOD/EASY           : RANDOM 1 bài PURE TEST.
 *   -> answer -> feedback (checkExerciseAnswer dùng chung) -> user tự rating
 *   -> recordGrammarResult ĐÚNG 1 LẦN (computeSrsPayload -> user_grammar)
 *   -> complete
 *
 * Invariants (mirror useStructureSession):
 *   - ONE RULE = MANY EXERCISES: load exercises bằng rule_id (UUID).
 *   - ONE EXERCISE RESULT = FEEDBACK ONLY: correctness không tự thành rating.
 *   - ONE RULE RATING = ONE SRS UPDATE: chặn double-submit, gọi ĐÚNG 1 lần
 *     ở CUỐI lượt gặp — payload không bao giờ chứa exercise_id.
 *   - Exercise bank rỗng -> phase 'no-exercises': KHÔNG rating, KHÔNG ghi SRS.
 *
 * @param {string} ruleId
 */
export function useGrammarSession(ruleId) {
  const { user } = useAuth();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [rule, setRule] = useState(null); // detail + user_grammar progress
  const [exercises, setExercises] = useState([]); // ngân hàng bài tập

  // Exercise hiện tại của phiên — bài ĐẦU trong kế hoạch (sequence hoặc random 1).
  const [currentExercise, setCurrentExercise] = useState(null);

  // Encounter-mode plan + vị trí sequence (mirrored qua ref cho handler).
  const [plan, setPlan] = useState(null);
  const [sequenceIndex, setSequenceIndex] = useState(0);
  const planRef = useRef(null);
  const seqIdxRef = useRef(0);

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
      setRule(null);
      setExercises([]);
      setCurrentExercise(null);
      setPlan(null);
      setSequenceIndex(0);
      planRef.current = null;
      seqIdxRef.current = 0;

      if (!user || !ruleId) {
        if (active) {
          setError('Thiếu thông tin phiên học.');
          setLoading(false);
        }
        return;
      }

      try {
        // Load rule (kèm user_grammar) + NGÂN HÀNG EXERCISE bằng ruleId (UUID).
        const [dRes, exRes] = await Promise.all([
          getGrammarRuleById(ruleId),
          getGrammarExercisesByRule(ruleId),
        ]);

        if (!active) return;
        if (dRes.error) throw dRes.error;
        if (exRes.error) throw exRes.error;

        const bank = exRes.data || [];
        setRule(dRes.data);
        setExercises(bank);
        // Kế hoạch exercise THEO SRS STATE của rule (resolveGrammarExercisePlan
        // = resolveStructureExercisePlan — generic trên (progress, bank)).
        const nextPlan = resolveGrammarExercisePlan(
          dRes.data.user_grammar || null,
          bank
        );
        planRef.current = nextPlan;
        seqIdxRef.current = 0;
        if (!active) return;
        setPlan(nextPlan);
        setSequenceIndex(0);
        setCurrentExercise(nextPlan.exercises[0] || null);
      } catch (e) {
        if (active) {
          if (import.meta.env.DEV) {
            console.error('[useGrammarSession] load error:', e);
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
  }, [ruleId, user]);

  // Preview interval cho từng rating — reuse computeSrsPayload (không hardcode).
  const previewIntervals = useMemo(() => {
    if (!rule) return {};
    const prog = rule.user_grammar || {};
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
  }, [rule]);

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

  // Nộp câu trả lời — checkExerciseAnswer DÙNG CHUNG với Structure exercises
  // (cùng 6 types, cùng shape). Correctness chỉ là FEEDBACK, không thành rating.
  const submitAnswer = useCallback(
    (userAnswer) => {
      if (!currentExercise || feedback?.submitted) return;
      const result = checkExerciseAnswer(currentExercise, userAnswer);
      setFeedback({ submitted: true, result, userAnswer });
    },
    [currentExercise, feedback]
  );

  // Sau feedback: giữa sequence -> bài kế; hết sequence / random -> rating.
  const proceedAfterFeedback = useCallback(() => {
    if (phase !== 'exercise') return;
    const activePlan = planRef.current;
    if (
      activePlan?.mode === 'sequence' &&
      seqIdxRef.current < activePlan.exercises.length - 1
    ) {
      const nextIdx = seqIdxRef.current + 1;
      seqIdxRef.current = nextIdx;
      setSequenceIndex(nextIdx);
      setCurrentExercise(activePlan.exercises[nextIdx]);
      setFeedback(null);
      return;
    }
    setPhase('rating');
    setFeedback(null);
  }, [phase]);

  // Rating Again/Hard/Good/Easy -> ghi SRS ĐÚNG MỘT LẦN (recordGrammarResult —
  // cùng scheduler computeSrsPayload với Vocabulary/Structure).
  const handleRating = useCallback(
    async (rating) => {
      if (!user || !rule || isRating) return;
      setIsRating(true);
      setRatingError(null);
      const { progress, error: srsError } = await recordGrammarResult({
        userId: user.id,
        ruleId: rule.id,
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
    [user, rule, isRating]
  );

  return {
    loading,
    error,
    rule,
    exercises,
    exerciseCount: exercises.length,
    currentExercise,
    phase,
    feedback,
    previewIntervals,
    isRating,
    ratingError,
    lastReviewResult,
    // Encounter-mode info cho UI (mirror useStructureSession):
    planMode: plan?.mode ?? null,
    sequenceIndex,
    sequenceTotal: plan?.exercises?.length ?? 0,
    revealRule: plan ? plan.revealAfterAnswer : true,
    startSession,
    submitAnswer,
    proceedAfterFeedback,
    handleRating,
  };
}

// Re-export để UI/test dùng một nguồn duy nhất.
export { computeSrsPayload, RATING };