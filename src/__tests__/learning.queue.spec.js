import { describe, it, expect, vi, beforeEach } from 'vitest';

// ------------------------------------------------------------------
// Service-level tests for the Unified Learn Engine queue builder
// (getLearnSessionQueue).
//
// These run the REAL getLearnSessionQueue but point its data layer at a
// LOCAL mock of the supabase client. This proves the production
// priority / scope logic without ever hitting a real Supabase database,
// so the fake user id ("user-1") never reaches a UUID parameter.
// ------------------------------------------------------------------

// Table data returned by the mocked client (per table name).
const tableData = {
  user_progress: [],
  vocabulary_sets: [],
  set_words: [],
};

// RPC responses, keyed by function name.
const rpcData = {};

const chainableFrom = (tableName) => {
  const chain = {
    select() { return chain; },
    eq() { return chain; },
    in() { return chain; },
    lte() { return chain; },
    gt() { return chain; },
    order() { return chain; },
    limit() { return chain; },
    maybeSingle: async () => ({ data: (tableData[tableName] || [])[0] ?? null, error: null }),
    upsert: async () => ({ data: null, error: null }),
    then(onFulfilled) {
      return Promise.resolve({ data: tableData[tableName] || [], error: null }).then(onFulfilled);
    },
  };
  return chain;
};

const rpcImpl = vi.fn(async (fn) => ({ data: rpcData[fn] ?? null, error: null }));
const fromImpl = vi.fn((tableName) => chainableFrom(tableName));

vi.mock('../services/supabase.js', () => ({
  supabase: {
    from: (...args) => fromImpl(...args),
    rpc: (...args) => rpcImpl(...args),
  },
}));

vi.mock('../services/srs.service.js', () => ({
  computeSrsUpdate: vi.fn(async () => ({ progress: {}, error: null })),
  RATING: { AGAIN: 0, HARD: 2, GOOD: 3, EASY: 4 },
}));

vi.mock('../services/dailyGoal.service.js', () => ({
  logDailyLearning: vi.fn(async () => ({ error: null })),
}));

import { getLearnSessionQueue } from '../services/learning.service.js';

describe('getLearnSessionQueue — Unified Learn Engine queue builder (mocked data layer)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tableData.user_progress = [];
    tableData.vocabulary_sets = [];
    tableData.set_words = [];
    rpcData['get_user_set_learn_priorities'] = [];
    rpcData['get_new_words_for_session'] = [];
  });

  it('normalizes setId "all" to an all-user scope (no set filter, no UUID RPC)', async () => {
    // A due review + a NEW candidate, fetched across all sets.
    tableData.user_progress = [
      {
        word_sense_id: 'due-1',
        mastery_level: 3,
        review_count: 3,
        flashcard_reviews: 2,
        review_due_at: new Date(Date.now() - 1000).toISOString(),
        state: 'review',
        word_senses: { id: 'due-1', meaning: 'due meaning', words: { word: 'dueword' } },
      },
    ];
    rpcData['get_new_words_for_session'] = [
      { id: 'n1', word: 'new1', meaning: 'new meaning', state: 'new' },
    ];
    // An all-user scope still computes prioritized set ids, but never filters
    // DUE/LEARNING by a specific set (set_words stays untouched).
    tableData.vocabulary_sets = [{ id: 'set-x' }];

    const { queue, error } = await getLearnSessionQueue('user-1', {
      learnMode: 'UNLIMITED',
      setId: 'all',
      dailyNewLimit: 10,
      introducedTodayCount: 0,
      sessionSize: 50,
    });

    expect(error).toBeNull();
    expect(queue.map((w) => w.id)).toEqual(['due-1', 'n1']);

    // The 'all' scope never becomes a set-specific fetch (set_words untouched).
    const setWordsCalls = fromImpl.mock.calls
      .map((c) => c[0])
      .filter((t) => t === 'set_words');
    // Confirm no set_words query happened for "all" scope.
    expect(setWordsCalls.length).toBe(0);
  });

  it('orders NEW candidates by set learn_priority: A1 (prio 1) before Family (prio 2)', async () => {
    tableData.vocabulary_sets = [{ id: 'set-a' }, { id: 'set-b' }];
    rpcData['get_user_set_learn_priorities'] = [
      { set_id: 'set-a', learn_priority: 1 }, // A1
      { set_id: 'set-b', learn_priority: 2 }, // Family
    ];
    // The NEW RPC returns candidates already honoring the prioritized set order.
    rpcData['get_new_words_for_session'] = [
      { id: 'a1-word', word: 'apple', meaning: 'quả táo', state: 'new', set_id: 'set-a' },
      { id: 'family-word', word: 'family', meaning: 'gia đình', state: 'new', set_id: 'set-b' },
    ];

    const { queue, error } = await getLearnSessionQueue('user-1', {
      learnMode: 'UNLIMITED',
      setId: 'all',
      dailyNewLimit: 10,
      introducedTodayCount: 0,
      sessionSize: 50,
    });

    expect(error).toBeNull();
    // NEW words come back in A1 -> Family priority order.
    expect(queue.map((w) => w.meaning)).toEqual(['quả táo', 'gia đình']);

    // The engine requested priorities for this user...
    expect(rpcImpl).toHaveBeenCalledWith('get_user_set_learn_priorities', { p_user_id: 'user-1' });
    // ...and passed the set ids to the NEW RPC sorted by priority (A1 before Family).
    const newRpcCall = rpcImpl.mock.calls.find((c) => c[0] === 'get_new_words_for_session');
    expect(newRpcCall[1]).toEqual({
      p_user_id: 'user-1',
      p_set_ids_prioritized: ['set-a', 'set-b'],
      p_limit: 50,
      p_excluded_sense_ids: [],
    });
  });
});
