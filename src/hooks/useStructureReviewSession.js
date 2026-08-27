import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from './useAuth.jsx';
import { getStructureExercises } from '../services/structure.service.js';
import {
  recordStructureResult,
  getStructureSessionQueue,
  getUserDailyNewStructureLimit,
  getDailyNewStructureProgress,
  markNewStructureIntroduced,
} from '../services/structure-learning.service.js';
import { computeSrsPayload, RATING } from '../services/srs.service.js';
import { checkExerciseAnswer } from '../utils/structure-exercise-checker.js';
import { resolveStructureExercisePlan } from '../utils/structure-status.js';

// Map UI rating strings -> SRS rating numbers (giống useLearningSession).
export const RATING_MAP = {
  again: RATING.AGAIN, // 0
  hard: RATING.HARD,   // 2
  good: RATING.GOOD,   // 3
  easy: RATING.EASY,   // 4
};

/**
 * Kiểm tra một structure có đang là MỚI (chưa được đưa vào SRS) hay không.
 * Mirror vocabulary rule: chưa có row user_structures HOẶC state='new'.
 * @param {object|null} progress - row user_structures của structure
 * @returns {boolean}
 */
function isNewStructureProgress(progress) {
  return !progress || progress.state === 'new' || !progress.state;
}

/**
 * CK10 — STRUCTURE REVIEW SESSION (tự động, giống Vocabulary Review).
 *
 * User KHÔNG chọn structure. Flow theo ENCOUNTER MODE dựa trên SRS state của
 * Structure (một Structure = MỘT knowledge item được SRS):
 *
 *   vào session
 *     -> queue DUE → LEARNING → NEW (getStructureSessionQueue — không đổi)
 *     -> system tự chọn structure kế tiếp
 *     -> resolveStructureExercisePlan(progress, bank):
 *          NEW / AGAIN            -> SEQUENCE ≤6 bài theo thứ tự ổn định;
 *                                    làm xong từng bài mới sang bài kế;
 *                                    rating CHỈ xuất hiện SAU bài cuối.
 *          review + last_rating AGAIN/HARD/không rõ -> RANDOM 1 bài guided
 *                                    (behavior CHECKPOINT 8 giữ nguyên).
 *          review + last_rating GOOD/EASY           -> RANDOM 1 bài PURE TEST
 *                                    (không render pattern/hint/scaffold).
 *     -> answer -> feedback (reveal tùy mode) -> user rating MỘT LẦN/structure
 *     -> recordStructureResult() ĐÚNG 1 LẦN (persist last_rating cùng thẻ SRS)
 *     -> TỰ ĐỘNG sang structure tiếp theo (không quay về queue)
 *     -> hết hàng -> completion.
 *
 * Invariants giữ nguyên / mở rộng:
 *   - ONE STRUCTURE = MANY EXERCISES (load bằng structure_id UUID).
 *   - SEQUENCE chỉ chứa exercise CỦA structure đó (fetch scoped theo id,
 *     planner chỉ slice/sort input — isolation giữa các structure tuyệt đối).
 *   - ONE USER ANSWER = ONE FEEDBACK (correctness ≠ rating). Trả lời sai giữa
 *     sequence KHÔNG tự chấm lại Structure — vẫn chạy hết sequence rồi chấm.
 *   - ONE STRUCTURE RATING = ONE SRS UPDATE (chặn double-submit), gọi ở CUỐI
 *     lượt gặp (sau bài cuối với NEW/AGAIN) — trước đó KHÔNG có UI rating.
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

  // Kế hoạch gặp structure hiện tại (sequence/random + revealAfterAnswer).
  // sequenceIndex = vị trí trong sequence khi mode='sequence'.
  const [plan, setPlan] = useState(null);
  const [sequenceIndex, setSequenceIndex] = useState(0);
  const planRef = useRef(null);
  const seqIdxRef = useRef(0);

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
  // Kế hoạch exercise do resolveStructureExercisePlan quyết định THEO SRS STATE:
  //   NEW/AGAIN -> sequence ≤6 bài ổn định | review -> random 1 bài.
  const startNextFrom = useCallback(async (list, startIndex, previouslySkipped = 0) => {
    let skipped = previouslySkipped;
    for (let i = startIndex; i < list.length; i += 1) {
      const s = list[i];
      const structureId = s.structureId ?? s.id;
      const res = await getStructureExercises(structureId);
      const bank = !res.error && Array.isArray(res.data) ? res.data : [];
      if (bank.length > 0) {
        const nextPlan = resolveStructureExercisePlan(s.user_structures || null, bank);
        posRef.current = i;
        setPosition(i);
        seqIdxRef.current = 0;
        setSequenceIndex(0);
        planRef.current = nextPlan;
        setPlan(nextPlan);
        const payload = { structure: s, exercise: nextPlan.exercises[0] || null };
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
    // Reset kế hoạch encounter-mode của lượt trước (nếu có).
    setPlan(null);
    setSequenceIndex(0);
    planRef.current = null;
    seqIdxRef.current = 0;

    try {
      // Daily NEW structure quota (mirror Vocabulary): đọc setting + progress
      // theo ngày business Việt Nam trước khi dựng queue.
      const [limitRes, progRes] = await Promise.all([
        getUserDailyNewStructureLimit(user.id),
        getDailyNewStructureProgress(user.id),
      ]);
      const introducedIds = progRes?.data ?? [];

      // Queue đã xếp sẵn DUE → LEARNING → NEW; chỉ nhóm NEW bị giới hạn hạn mức.
      const { data, error: qErr } = await getStructureSessionQueue(user.id, {
        dailyNewStructureLimit: limitRes?.value ?? undefined,
        introducedTodayStructureIds: introducedIds,
      });
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

  // Sau feedback:
  //   - đang GIỮA sequence (NEW/AGAIN) -> exercise KẾ TIẾP của chính sequence đó.
  //     KHÔNG hiển thị rating giữa chừng; answer sai cũng KHÔNG dừng/ngắt sequence
  //     (rating chỉ diễn ra sau khi hoàn thành toàn bộ bài của lượt gặp).
  //   - hoàn thành sequence / mode random (1 bài) -> sang rating Structure.
  const proceedAfterFeedback = useCallback(() => {
    const activePlan = planRef.current;
    if (
      activePlan?.mode === 'sequence' &&
      seqIdxRef.current < activePlan.exercises.length - 1
    ) {
      const nextIdx = seqIdxRef.current + 1;
      seqIdxRef.current = nextIdx;
      setSequenceIndex(nextIdx);
      const nextPayload = {
        structure: currentRef.current.structure,
        exercise: activePlan.exercises[nextIdx],
      };
      currentRef.current = nextPayload;
      setCurrent(nextPayload);
      setFeedback(null);
      setPhase('exercise');
      return;
    }
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

      // Structure này vừa được đưa vào SRS lần đầu -> đếm vào hạn mức cấu trúc
      // MỚI của hôm nay (idempotent upsert, non-fatal như Vocabulary).
      if (isNewStructureProgress(cur.structure.user_structures || null)) {
        markNewStructureIntroduced(user.id, cur.structure.structureId ?? cur.structure.id)
          .catch(() => {
            // Non-fatal: hạn mức ngày có thể hào phóng hơn nhưng không phá phiên.
          });
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
    // Encounter-mode info cho UI:
    //   planMode 'sequence' (NEW/AGAIN) | 'random' (HARD/GOOD/EASY)
    //   sequenceIndex/sequenceTotal -> progress "Bài x/n"
    //   revealStructure=false -> PURE TEST, không render pattern/hint/scaffold.
    planMode: plan?.mode ?? null,
    sequenceIndex,
    sequenceTotal: plan?.exercises?.length ?? 0,
    revealStructure: plan ? plan.revealAfterAnswer : true,
    restart: beginSession,
    submitAnswer,
    proceedAfterFeedback,
    handleRating,
  };
}

// Re-export để UI/test dùng một nguồn duy nhất.
export { computeSrsPayload, RATING };


