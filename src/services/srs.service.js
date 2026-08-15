// Lazy-import supabase inside DB functions so offline tests can run without env

// Ratings
export const RATING = {
  AGAIN: 0,
  HARD: 2,
  GOOD: 3,
  EASY: 4,
};

const MIN_EF = 1.3;
const DEFAULT_EF = 2.5;
const MAX_EF = 10.0;
// Cap interval to a few years (hours). 10 years ≈ 10 * 365 * 24 = 87600 hours
export const MAX_INTERVAL_HOURS = 87600;

// Learning steps in minutes. Ratings advance through these steps differently:
// Again restarts, Hard repeats the current step, Good advances one step, and
// Easy advances two. Once a card graduates, the intervals below are used.
const LEARNING_STEPS_MIN = [10, 60, 240]; // 10m, 1h, 4h
const RELEARN_STEPS_MIN = [10, 60];
const GRADUATING_INTERVAL_HOURS = {
  [RATING.HARD]: 24,
  [RATING.GOOD]: 72,
  [RATING.EASY]: 168,
};

function minutesToIso(minutes) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function hoursToIso(hours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

async function fetchProgress(userId, wordSenseId) {
  try {
    const mod = await import('./supabase.js');
    const supabase = mod?.supabase;
    if (!supabase) return null;
    const { data, error } = await supabase
      .from('user_progress')
      .select('*')
      .eq('user_id', userId)
      .eq('word_sense_id', wordSenseId)
      .maybeSingle();
    if (error && error.code !== 'PGRST116') throw error;
    return data || null;
  } catch (e) {
    // If supabase isn't configured (e.g., running tests), return null so computation can proceed
    return null;
  }
}

// Pure computation function: given an existing progress object (possibly empty)
// and a rating, compute the SRS update payload without DB access.
export function computeSrsPayload(prog = {}, rating, ids = {}) {
  // Initialize defaults safely with guards
  const state = prog.state || 'new';
  const parseNumber = (v, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  let ease = parseNumber(prog.ease_factor, DEFAULT_EF);
  let repetitions = Math.max(0, Math.floor(parseNumber(prog.repetitions, 0)));
  let interval_hours = Math.max(0, parseNumber(prog.interval_hours, 0));
  let lapses = Math.max(0, Math.floor(parseNumber(prog.lapses, 0)));
  let learning_step = Math.max(0, Math.floor(parseNumber(prog.learning_step, 0)));
  // Sanitize mastery_level: ensure finite number in [0,5]
  const rawMastery = Number(prog.mastery_level);
  const mastery_level = Number.isFinite(rawMastery) ? Math.max(0, Math.min(5, rawMastery)) : 0;

  // Normalize rating
  const q = Number.isFinite(Number(rating)) ? Number(rating) : (rating === true ? RATING.GOOD : RATING.AGAIN);

  function clampEF(v) { return Math.max(MIN_EF, Math.min(MAX_EF, v)); }
  function clampInterval(h) {
    if (!Number.isFinite(h) || isNaN(h)) return 0;
    return Math.max(0, Math.min(Math.round(h), MAX_INTERVAL_HOURS));
  }

  let nextDueIso = prog.review_due_at || new Date().toISOString();
  let nextState = state;

  if (state === 'new' || state === 'learning' || state === 'relearning') {
    const steps = state === 'relearning' ? RELEARN_STEPS_MIN : LEARNING_STEPS_MIN;
    // Ensure learning_step is within [0, steps.length]
    learning_step = Math.min(Math.max(0, learning_step), steps.length);

    if (q === RATING.AGAIN) {
      learning_step = 0;
      nextDueIso = minutesToIso(steps[0]);
      nextState = state === 'relearning' ? 'relearning' : 'learning';
    } else {
      const advanceBy = q === RATING.EASY ? 2 : q === RATING.GOOD ? 1 : 0;
      // At the last learning step, every successful rating graduates. This
      // gives the final typing rating its meaningful 1d / 3d / 7d choice.
      const nextStep =
        learning_step === steps.length - 1 && q >= RATING.HARD
          ? steps.length
          : learning_step + advanceBy;

      if (nextStep < steps.length) {
        // Hard stays on its current step; Good/Easy move further through the
        // learning steps. This makes the preview reflect the same scheduler
        // that will be persisted below.
        learning_step = nextStep;
        nextDueIso = minutesToIso(steps[learning_step]);
        nextState = state === 'relearning' ? 'relearning' : 'learning';
      } else {
        // Graduate to review. The values use the application's existing SRS
        // cadence: 1 day (Hard), 3 days (Good), 7 days (Easy).
        nextState = 'review';
        repetitions = 1;
        interval_hours = clampInterval(GRADUATING_INTERVAL_HOURS[q] ?? 72);
        nextDueIso = hoursToIso(interval_hours);
        learning_step = 0;
        if (q === RATING.EASY) ease = clampEF(ease + 0.15);
      }
    }
  } else {
    // REVIEW state
    if (q === RATING.AGAIN) {
      // lapse
      lapses = Math.max(0, lapses + 1);
      nextState = 'relearning';
      learning_step = 0;
      repetitions = 0;
      ease = clampEF(ease - 0.20);
      nextDueIso = minutesToIso(RELEARN_STEPS_MIN[0]);
    } else {
      // success in review
      // compute new interval
      if (repetitions <= 0) {
        interval_hours = 24; // first review after learning
      } else if (repetitions === 1) {
        interval_hours = 24 * 6; // 6 days
      } else {
        // multiply
        interval_hours = Math.max(24, Math.round(interval_hours * ease));
      }

      // apply adjustments for HARD/EASY
      if (q === RATING.HARD) {
        // Hard: modestly reduce interval or keep it smaller than GOOD
        ease = clampEF(ease - 0.10);
        interval_hours = Math.max(4, Math.round(interval_hours * 0.85));
      } else if (q === RATING.EASY) {
        ease = clampEF(ease + 0.15);
        interval_hours = Math.round(interval_hours * 1.3);
      }

      interval_hours = clampInterval(interval_hours);
      repetitions = repetitions + 1;
      nextDueIso = hoursToIso(interval_hours);
      nextState = 'review';
    }
  }

  const nowIso = new Date().toISOString();
  const payload = {
    user_id: ids.userId || prog.user_id,
    word_sense_id: ids.wordSenseId || prog.word_sense_id,
    mastery_level,
    review_due_at: nextDueIso,
    last_reviewed_at: nowIso,
    repetitions,
    interval_hours,
    ease_factor: clampEF(ease),
    lapses,
    state: nextState,
    learning_step,
  };

  return { progress: payload, error: null };
}

// Core FSRS-like update: accept rating (0/2/3/4) and return upsert payload object
export async function computeSrsUpdate({ userId, wordSenseId, rating }) {
  if (!userId || !wordSenseId) return { error: { message: 'Missing userId or wordSenseId' } };
  const prog = (await fetchProgress(userId, wordSenseId)) || {};
  return computeSrsPayload(prog, rating, { userId, wordSenseId });
}
