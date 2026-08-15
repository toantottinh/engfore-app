import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock computeSrsUpdate to return a deterministic srsProgress
vi.mock('../services/srs.service.js', () => ({
  computeSrsUpdate: vi.fn(async ({ userId, wordSenseId, rating }) => {
    // return a predictable progress payload
    return {
      progress: {
        user_id: userId,
        word_sense_id: wordSenseId,
        mastery_level: 2,
        review_due_at: new Date(Date.now() + 3600 * 1000).toISOString(),
        last_reviewed_at: new Date().toISOString(),
        repetitions: 1,
        interval_hours: 1,
        ease_factor: 2.5,
        lapses: 0,
        state: 'review',
        learning_step: 0,
      },
      error: null,
    };
  }),
  RATING: { AGAIN: 0, HARD: 2, GOOD: 3, EASY: 4 },
}));

// Mock supabase client used by learning.service with chainable methods
const upsertMock = vi.fn(async (payload) => ({ error: null }));
const maybeSingleMock = vi.fn(async () => ({ data: null, error: null }));

vi.mock('../services/supabase.js', () => ({
  supabase: {
    from: vi.fn(() => {
      // Chainable object
      const chain = {
        select: function () { return chain; },
        eq: function () { return chain; },
        in: function () { return chain; },
        lte: function () { return chain; },
        gt: function () { return chain; },
        order: function () { return chain; },
        limit: function () { return chain; },
        maybeSingle: maybeSingleMock,
        upsert: upsertMock,
        selectRaw: function () { return chain; },
      };
      return chain;
    }),
  },
}));

import { recordLearningResult } from '../services/learning.service.js';
import { computeSrsUpdate } from '../services/srs.service.js';

describe('recordLearningResult integration (mocked supabase & srs)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls computeSrsUpdate and upserts merged payload', async () => {
    const userId = 'user-1';
    const wordSenseId = 'sense-1';

    const { progress, error } = await recordLearningResult({ userId, wordSenseId, rating: 3 });
    expect(error).toBeNull();
    // computeSrsUpdate should have been called
    expect(computeSrsUpdate).toHaveBeenCalled();
    // upsert should be called with progress payload (merged mastery) — upsertMock called
    expect(upsertMock).toHaveBeenCalled();
    // upsert payload should include review_count increment (from 0 -> 1)
    const upsertArg = upsertMock.mock.calls[0][0];
    expect(upsertArg.review_count).toBeDefined();
    expect(Number(upsertArg.review_count)).toBeGreaterThanOrEqual(1);
    // Returned progress should include mastery_level (from mocked computeSrsUpdate and merging)
    expect(progress.mastery_level).toBeDefined();
    expect(progress.review_due_at).toBeDefined();
    expect(progress.review_count).toBeDefined();
  });

  it('retries without flashcard_reviews only when that production column is missing', async () => {
    maybeSingleMock
      .mockResolvedValueOnce({
        data: null,
        error: { code: '42703', message: 'column user_progress.flashcard_reviews does not exist' },
      })
      .mockResolvedValueOnce({ data: null, error: null });
    upsertMock
      .mockResolvedValueOnce({
        data: null,
        error: { code: '42703', message: 'column user_progress.flashcard_reviews does not exist' },
      })
      .mockResolvedValueOnce({ data: null, error: null });

    const { progress, error } = await recordLearningResult({
      userId: 'user-1',
      wordSenseId: 'sense-1',
      rating: 3,
      isFlashcard: true,
    });

    expect(error).toBeNull();
    expect(upsertMock).toHaveBeenCalledTimes(2);
    expect(upsertMock.mock.calls[0][0].flashcard_reviews).toBe(1);
    expect(upsertMock.mock.calls[1][0].flashcard_reviews).toBeUndefined();
    expect(progress.flashcard_reviews_persisted).toBe(false);
  });
});
