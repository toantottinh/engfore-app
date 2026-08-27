import { describe, it, expect, beforeEach } from 'vitest';
import {
  resolveSessionWordState,
  countSessionStates,
  SESSION_STATE,
} from '../hooks/useLearningSession.js';

const { NEW, REVIEW, AGAIN, DONE } = SESSION_STATE;

describe('resolveSessionWordState — session counter transitions', () => {
  // REQUIRED CASE 1 — NEW + AGAIN: introduction is NOT completed yet, so the
  // word KEEPS being counted as 🟢 Mới ("Từ mới" counter must not drop).
  it('CASE 1. NEW → AGAIN: từ vẫn còn NEW (không rời nhóm Mới)', () => {
    expect(resolveSessionWordState(NEW, 'again', NEW)).toBe(NEW);
  });

  // REQUIRED CASES 2–4 — NEW + HARD/GOOD/EASY completes the introduction:
  // the word leaves the 🟢 Mới bucket → "Từ mới" counter decrements by 1.
  it('CASES 2–4. NEW → HARD/GOOD/EASY: hoàn thành NEW (ra khỏi nhóm Mới)', () => {
    expect(resolveSessionWordState(NEW, 'hard', NEW)).toBe(DONE);
    expect(resolveSessionWordState(NEW, 'good', NEW)).toBe(DONE);
    expect(resolveSessionWordState(NEW, 'easy', NEW)).toBe(DONE);
  });

  // REQUIRED CASE 6 — REVIEW + AGAIN lapses into the red bucket exactly once;
  // the NEW counter is untouched by anything that happens to a REVIEW word.
  it('REVIEW → AGAIN: review word moves to the red bucket (Ôn -1)', () => {
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

  // REQUIRED CASE 5 — REVIEW answered correctly exits 🟠 Ôn; NEW counter untouched.
  it('REVIEW answered correctly (hard/good/easy) exits 🟠 Ôn', () => {
    expect(resolveSessionWordState(REVIEW, 'good', REVIEW)).toBe(DONE);
    expect(resolveSessionWordState(REVIEW, 'hard', REVIEW)).toBe(DONE);
    expect(resolveSessionWordState(REVIEW, 'easy', REVIEW)).toBe(DONE);
  });

  it('unknown current state falls back to the initial word state', () => {
    // Unknown state that falls back to NEW + Again → still NEW (case-1 rule).
    expect(resolveSessionWordState('', 'again', NEW)).toBe(NEW);
    // Unknown state that falls back to REVIEW + correct → treated as REVIEW→correct → done.
    expect(resolveSessionWordState(undefined, 'good', REVIEW)).toBe(DONE);
    // Unknown state that falls back to REVIEW + Again → red bucket.
    expect(resolveSessionWordState(undefined, 'again', REVIEW)).toBe(AGAIN);
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

    // Step 1 — Mới (NEW) answered WRONG with Again → VẪN còn Mới
    // (introduction chưa hoàn thành ⇒ "Từ mới" KHÔNG giảm — required case 1).
    states.n1 = resolveSessionWordState(states.n1, 'again', NEW);
    expect(countSessionStates(states)).toEqual({ new: 3, again: 0, review: 5 });

    // Step 2 — Ôn (REVIEW) answered wrong → Ôn -1, AGAIN +1, Mới unchanged
    states.r1 = resolveSessionWordState(states.r1, 'again', REVIEW);
    expect(countSessionStates(states)).toEqual({ new: 3, again: 1, review: 4 });

    // Step 3 — an Again word re-reviewed and STILL wrong → every counter unchanged
    states.r1 = resolveSessionWordState(states.r1, 'again', REVIEW);
    expect(countSessionStates(states)).toEqual({ new: 3, again: 1, review: 4 });

    // Step 4 — the SAME Mới word now completed with GOOD → Mới -1
    states.n1 = resolveSessionWordState(states.n1, 'good', NEW);
    expect(countSessionStates(states)).toEqual({ new: 2, again: 1, review: 4 });

    // Step 5 — an Again word answered correctly → AGAIN -1 only
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

  it('a NEW card answered correctly NEVER touches the Ôn or Again counter', () => {
    const states = { n1: NEW, r1: REVIEW };
    expect(countSessionStates(states)).toEqual({ new: 1, again: 0, review: 1 });

    // NEW → GOOD: the completed word leaves the green bucket only.
    states.n1 = resolveSessionWordState(states.n1, 'good', NEW);
    expect(countSessionStates(states)).toEqual({ new: 0, again: 0, review: 1 });
  });

  it('NEW→AGAIN keeps the Mới count until the retry completes; HARD then drops it once', () => {
    let states = { n1: NEW, r1: REVIEW };
    expect(countSessionStates(states)).toEqual({ new: 1, again: 0, review: 1 });

    // NEW → AGAIN: vẫn còn Mới (counter không đổi — required case 1).
    states.n1 = resolveSessionWordState(states.n1, 'again', NEW);
    expect(countSessionStates(states)).toEqual({ new: 1, again: 0, review: 1 });

    // Another Again on the unfinished NEW word → still counted as Mới.
    states.n1 = resolveSessionWordState(states.n1, 'again', NEW);
    expect(countSessionStates(states)).toEqual({ new: 1, again: 0, review: 1 });

    // Retry succeeded with HARD → hoàn thành NEW → Mới -1 (một lần duy nhất).
    states.n1 = resolveSessionWordState(states.n1, 'hard', NEW);
    expect(countSessionStates(states)).toEqual({ new: 0, again: 0, review: 1 });
  });
});