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

  it('REVIEW answered correctly stays 🟠 Ôn', () => {
    expect(resolveSessionWordState(REVIEW, 'good', REVIEW)).toBe(REVIEW);
  });

  it('unknown current state falls back to the initial word state', () => {
    expect(resolveSessionWordState('', AGAIN, NEW)).toBe(AGAIN);
    expect(resolveSessionWordState(undefined, 'good', REVIEW)).toBe(REVIEW);
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