import { describe, it, expect, beforeEach } from 'vitest';
import {
  resolveSessionWordState,
  countSessionStates,
  SESSION_STATE,
} from '../hooks/useLearningSession.js';

const { NEW, REVIEW, AGAIN, DONE } = SESSION_STATE;

describe('resolveSessionWordState — session counter transitions', () => {
  it('NEW → AGAIN: word lands in the red bucket', () => {
    expect(resolveSessionWordState(NEW, 'again', NEW)).toBe(AGAIN);
  });

  it('REVIEW → AGAIN: review word moves to the red bucket', () => {
    expect(resolveSessionWordState(REVIEW, 'again', REVIEW)).toBe(AGAIN);
  });

  it('AGAIN → AGAIN: a repeated Again keeps the word in the red bucket (no double count)', () => {
    expect(resolveSessionWordState(AGAIN, 'again')).toBe(AGAIN);
  });

  it('AGAIN → correct (hard/good/easy): the word leaves the red bucket', () => {
    expect(resolveSessionWordState(AGAIN, 'good')).toBe(DONE);
    expect(resolveSessionWordState(AGAIN, 'hard')).toBe(DONE);
    expect(resolveSessionWordState(AGAIN, 'easy')).toBe(DONE);
  });

  it('NEW answered correctly stays 🟢 Mới (never counted as Again/Ôn)', () => {
    expect(resolveSessionWordState(NEW, 'good', NEW)).toBe(NEW);
  });

  it('REVIEW answered correctly (hard/good/easy) exits 🟠 Ôn (bug fix)', () => {
    expect(resolveSessionWordState(REVIEW, 'good', REVIEW)).toBe(DONE);
    expect(resolveSessionWordState(REVIEW, 'hard', REVIEW)).toBe(DONE);
    expect(resolveSessionWordState(REVIEW, 'easy', REVIEW)).toBe(DONE);
  });

  it('unknown current state falls back to the initial word state', () => {
    // Unknown state that falls back to NEW + Again → red bucket.
    expect(resolveSessionWordState('', AGAIN, NEW)).toBe(AGAIN);
    // Unknown state that falls back to REVIEW + correct → treated as REVIEW→correct → done.
    expect(resolveSessionWordState(undefined, 'good', REVIEW)).toBe(DONE);
  });
});

describe('countSessionStates — counter aggregation', () => {
  it('aggregates new/review/again and drops done words', () => {
    const states = {
      n1: NEW,
      n2: AGAIN,
      r1: REVIEW,
      r2: DONE,
    };
    expect(countSessionStates(states)).toEqual({ new: 1, again: 1, review: 1 });
  });
});

describe('full required example sequence (3 NEW / 0 AGAIN / 5 REVIEW)', () => {
  // states keyed the same way useLearningSession stores them (word id -> state)
  let states;

  beforeEach(() => {
    states = {
      n1: NEW, n2: NEW, n3: NEW,
      r1: REVIEW, r2: REVIEW, r3: REVIEW, r4: REVIEW, r5: REVIEW,
    };
  });

  it('walks the whole example and ends at NEW 2 / AGAIN 0 / REVIEW 4', () => {
    expect(countSessionStates(states)).toEqual({ new: 3, again: 0, review: 5 });

    // Step 1 — one Mới (NEW) answered wrong → NEW -1, AGAIN +1, Ôn unchanged
    states.n1 = resolveSessionWordState(states.n1, AGAIN, NEW);
    expect(countSessionStates(states)).toEqual({ new: 2, again: 1, review: 5 });

    // Step 2 — one Ôn (REVIEW) answered wrong → Ôn -1, AGAIN +1, Mới unchanged
    states.r1 = resolveSessionWordState(states.r1, AGAIN, REVIEW);
    expect(countSessionStates(states)).toEqual({ new: 2, again: 2, review: 4 });

    // Step 3 — an Again word re-reviewed and STILL wrong → every counter unchanged
    states.n1 = resolveSessionWordState(states.n1, AGAIN, NEW);
    expect(countSessionStates(states)).toEqual({ new: 2, again: 2, review: 4 });

    // Step 4 — an Again word answered correctly → AGAIN -1 only
    states.n1 = resolveSessionWordState(states.n1, 'good', NEW);
    expect(countSessionStates(states)).toEqual({ new: 2, again: 1, review: 4 });

    // Step 5 — the last Again word answered correctly → AGAIN 0
    states.r1 = resolveSessionWordState(states.r1, 'good', REVIEW);
    expect(countSessionStates(states)).toEqual({ new: 2, again: 0, review: 4 });
  });
});

describe('bug: REVIEW answered correctly must decrement the 🟠 Ôn counter', () => {
  it('REVIEW→HARD / REVIEW→GOOD / REVIEW→EASY each drop the review bucket by 1', () => {
    // Start from the reported example: 🟢 Mới 3 / 🔴 Again 0 / 🟡 Ôn 5
    let states = {
      n1: NEW, n2: NEW, n3: NEW,
      r1: REVIEW, r2: REVIEW, r3: REVIEW, r4: REVIEW, r5: REVIEW,
    };
    expect(countSessionStates(states)).toEqual({ new: 3, again: 0, review: 5 });

    // REVIEW → HARD: Ôn -1, Again unchanged, Mới unchanged
    states.r1 = resolveSessionWordState(states.r1, 'hard', REVIEW);
    expect(countSessionStates(states)).toEqual({ new: 3, again: 0, review: 4 });

    // REVIEW → GOOD: Ôn -1, Again unchanged
    states.r2 = resolveSessionWordState(states.r2, 'good', REVIEW);
    expect(countSessionStates(states)).toEqual({ new: 3, again: 0, review: 3 });

    // REVIEW → EASY: Ôn -1, Again unchanged
    states.r3 = resolveSessionWordState(states.r3, 'easy', REVIEW);
    expect(countSessionStates(states)).toEqual({ new: 3, again: 0, review: 2 });
  });

  it('non-REVIEW cards are never decremented from the Ôn counter', () => {
    // A NEW card answered correctly must NOT touch the review count (stays green).
    const states = { n1: NEW, r1: REVIEW };
    expect(countSessionStates(states)).toEqual({ new: 1, again: 0, review: 1 });

    states.n1 = resolveSessionWordState(states.n1, 'good', NEW);
    expect(countSessionStates(states)).toEqual({ new: 1, again: 0, review: 1 });
  });

  it('NEW→AGAIN and AGAIN→AGAIN still behave correctly (never double-count Again)', () => {
    let states = { n1: NEW, r1: REVIEW };
    expect(countSessionStates(states)).toEqual({ new: 1, again: 0, review: 1 });

    // NEW → AGAIN: green -1, red +1
    states.n1 = resolveSessionWordState(states.n1, 'again', NEW);
    expect(countSessionStates(states)).toEqual({ new: 0, again: 1, review: 1 });

    // AGAIN → AGAIN: no additional red, no green/Ôn change
    states.n1 = resolveSessionWordState(states.n1, 'again', NEW);
    expect(countSessionStates(states)).toEqual({ new: 0, again: 1, review: 1 });

    // AGAIN → correct: red -1 only
        states.n1 = resolveSessionWordState(states.n1, 'good', NEW);
    expect(countSessionStates(states)).toEqual({ new: 0, again: 0, review: 1 });
  });
});