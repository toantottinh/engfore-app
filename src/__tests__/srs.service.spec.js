import { describe, it, expect } from 'vitest';
import { computeSrsPayload, RATING } from '../services/srs.service.js';

function isIso(s) {
  return typeof s === 'string' && !Number.isNaN(Date.parse(s));
}

describe('computeSrsPayload (pure SRS logic)', () => {
  it('new state + AGAIN schedules learning step 0', () => {
    const prog = { state: 'new', learning_step: 0, ease_factor: 2.5 };
    const { progress, error } = computeSrsPayload(prog, RATING.AGAIN, {
      userId: 'user-1',
      wordSenseId: 'sense-1',
    });
    expect(error).toBeNull();
    expect(progress.state === 'learning' || progress.state === 'relearning').toBeTruthy();
    expect(progress.learning_step).toBe(0);
    expect(isIso(progress.review_due_at)).toBeTruthy();
    expect(progress.interval_hours).toBeGreaterThanOrEqual(0);
    expect(progress.user_id).toBe('user-1');
    expect(progress.word_sense_id).toBe('sense-1');
  });

  it('new state + GOOD eventually graduates to review with interval_hours >= 24', () => {
    const prog = { state: 'new', learning_step: 2, ease_factor: 2.5 };
    const { progress } = computeSrsPayload(prog, RATING.GOOD);
    // after finishing learning steps should be review
    expect(progress.state).toBe('review');
    expect(progress.repetitions).toBeGreaterThanOrEqual(1);
    expect(progress.interval_hours).toBeGreaterThanOrEqual(24);
    expect(isIso(progress.review_due_at)).toBeTruthy();
  });

  it('uses distinct scheduler intervals for learning ratings at graduation', () => {
    const base = { state: 'learning', learning_step: 2, ease_factor: 2.5 };
    const { progress: again } = computeSrsPayload(base, RATING.AGAIN);
    const { progress: hard } = computeSrsPayload(base, RATING.HARD);
    const { progress: good } = computeSrsPayload(base, RATING.GOOD);
    const { progress: easy } = computeSrsPayload(base, RATING.EASY);

    expect(again.interval_hours).toBe(0);
    expect(hard.interval_hours).toBe(24);
    expect(good.interval_hours).toBe(72);
    expect(easy.interval_hours).toBe(168);
    expect(Date.parse(again.review_due_at)).toBeLessThan(Date.parse(hard.review_due_at));
    expect(Date.parse(good.review_due_at)).toBeLessThan(Date.parse(easy.review_due_at));
  });

  it('never treats Hard, Good, or Easy as Again for a new card', () => {
    const base = { state: 'new', learning_step: 0 };
    const { progress: again } = computeSrsPayload(base, RATING.AGAIN);
    const { progress: hard } = computeSrsPayload(base, RATING.HARD);
    const { progress: good } = computeSrsPayload(base, RATING.GOOD);
    const { progress: easy } = computeSrsPayload(base, RATING.EASY);

    expect(again.learning_step).toBe(0);
    expect(hard.state).toBe('learning');
    expect(good.learning_step).toBe(1);
    expect(easy.learning_step).toBe(2);
    expect(good.review_due_at).not.toBe(again.review_due_at);
    expect(easy.review_due_at).not.toBe(again.review_due_at);
  });

  it('review state + AGAIN -> relearning and increases lapses', () => {
    const prog = { state: 'review', repetitions: 2, lapses: 0, ease_factor: 2.5 };
    const { progress } = computeSrsPayload(prog, RATING.AGAIN);
    expect(progress.state).toBe('relearning');
    expect(progress.lapses).toBeGreaterThanOrEqual(1);
    expect(progress.learning_step).toBe(0);
    expect(isIso(progress.review_due_at)).toBeTruthy();
  });

  it('review state + HARD reduces ease and interval compared to GOOD', () => {
    const base = { state: 'review', repetitions: 2, interval_hours: 48, ease_factor: 2.5 };
    const { progress: pHard } = computeSrsPayload(base, RATING.HARD);
    const { progress: pGood } = computeSrsPayload(base, RATING.GOOD);
    const { progress: pEasy } = computeSrsPayload(base, RATING.EASY);

    // HARD should reduce ease compared to GOOD
    expect(pHard.ease_factor).toBeLessThanOrEqual(pGood.ease_factor + 0.0001);
    // EASY should have larger interval than GOOD
    expect(pEasy.interval_hours).toBeGreaterThanOrEqual(pGood.interval_hours);
    // HARD interval should be <= GOOD interval
    expect(pHard.interval_hours).toBeLessThanOrEqual(pGood.interval_hours + 1);
  });
});
