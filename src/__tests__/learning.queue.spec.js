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
  // Track filters applied (eq/in/lte/gt) so the mock surfaces the actual
  // SQL constraints the production queries use.  This lets us assert that
  // the DUE/LEARNING state & timing filters behave correctly.
  const filters = [];
  const chain = {
    select() { return chain; },
    eq(col, val) { filters.push(['eq', col, val]); return chain; },
    in(col, vals) { filters.push(['in', col, vals]); return chain; },
    lte(col, val) { filters.push(['lte', col, val]); return chain; },
    gt(col, val) { filters.push(['gt', col, val]); return chain; },
    order() { return chain; },
    limit() { return chain; },
    maybeSingle: async () => ({ data: (tableData[tableName] || [])[0] ?? null, error: null }),
    upsert: async () => ({ data: null, error: null }),
    then(onFulfilled) {
      let data = [...(tableData[tableName] || [])];
      for (const [op, col, val] of filters) {
        data = data.filter((row) => {
          const rowVal = row[col];
          if (rowVal === undefined || rowVal === null) return false;
          switch (op) {
            case 'eq': return rowVal === val;
            case 'in': return (val || []).includes(rowVal);
            case 'lte': return new Date(rowVal).getTime() <= new Date(val).getTime();
            case 'gt': return new Date(rowVal).getTime() > new Date(val).getTime();
            default: return true;
          }
        });
      }
      return Promise.resolve({ data, error: null }).then(onFulfilled);
    },
  };
  return chain;
};

const rpcImpl = vi.fn(async (fn, args) => {
  let data = rpcData[fn] ?? null;
  // Mirrors the real RPC: get_new_words_for_session applies p_limit
  // server-side, so even if the DB holds thousands of candidates only the
  // requested number ever reaches the client.
  if (fn === 'get_new_words_for_session' && Array.isArray(data) && args?.p_limit != null) {
    data = data.slice(0, args.p_limit);
  }
  return { data, error: null };
});
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
        user_id: 'user-1',
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
    tableData.vocabulary_sets = [{ id: 'set-x', user_id: 'user-1' }];

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
    tableData.vocabulary_sets = [{ id: 'set-a', user_id: 'user-1' }, { id: 'set-b', user_id: 'user-1' }];
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

  it('Part G: excludes graduated REVIEW cards (future due) from the LEARNING queue', async () => {
    const now = Date.now();
    tableData.vocabulary_sets = [];
    rpcData['get_new_words_for_session'] = [];

    tableData.user_progress = [
      // A word that just graduated to 'review' after a Good rating; its
      // review_due_at is 72h in the FUTURE.  Without the state filter this
      // card is wrongly re-fetched into the learning queue on the next load.
      {
        user_id: 'user-1',
        word_sense_id: 'graduated-1',
        state: 'review',
        review_due_at: new Date(now + 72 * 3600 * 1000).toISOString(),
        mastery_level: 3,
        word_senses: { id: 'graduated-1', meaning: 'graduated', words: { word: 'graduated' } },
      },
      // A card genuinely still in an active 'learning' step, due in 10 min.
      {
        user_id: 'user-1',
        word_sense_id: 'learning-1',
        state: 'learning',
        review_due_at: new Date(now + 10 * 60 * 1000).toISOString(),
        mastery_level: 1,
        word_senses: { id: 'learning-1', meaning: 'learning', words: { word: 'learning' } },
      },
    ];

    const { queue, error } = await getLearnSessionQueue('user-1', {
      learnMode: 'UNLIMITED',
      setId: 'all',
      dailyNewLimit: 10,
      introducedTodayCount: 0,
      sessionSize: 50,
    });

    expect(error).toBeNull();
    // DUE section is empty (both future), and the LEARNING section must only
    // contain 'learning-1' — the graduated 'review' card must NOT reappear.
    expect(queue.map((w) => w.id)).toEqual(['learning-1']);
  });

  it('Part A: DUE and LEARNING filters do not overlap a card at the boundary', async () => {
    const now = Date.now();
    tableData.vocabulary_sets = [];
    rpcData['get_new_words_for_session'] = [];

    tableData.user_progress = [
      // In the recent past → belongs in the DUE bucket, not LEARNING.
      {
        user_id: 'user-1',
        word_sense_id: 'just-due',
        state: 'learning',
        review_due_at: new Date(now - 10 * 60 * 1000).toISOString(),
        mastery_level: 1,
        word_senses: { id: 'just-due', meaning: 'due', words: { word: 'due' } },
      },
      // Clearly in the future → belongs in LEARNING, not DUE.
      {
        user_id: 'user-1',
        word_sense_id: 'just-future',
        state: 'learning',
        review_due_at: new Date(now + 10 * 60 * 1000).toISOString(),
        mastery_level: 1,
        word_senses: { id: 'just-future', meaning: 'future', words: { word: 'future' } },
      },
    ];

    const { queue, error } = await getLearnSessionQueue('user-1', {
      learnMode: 'UNLIMITED',
      setId: 'all',
      dailyNewLimit: 10,
      introducedTodayCount: 0,
      sessionSize: 50,
    });

    expect(error).toBeNull();
    expect(queue.map((w) => w.id)).toEqual(['just-due', 'just-future']);
  });

  it('Point 3: with 2500 NEW candidates and daily limit 50, queue caps at 50 NEW and zero REVIEW', async () => {
    // User has studied NOTHING yet: no user_progress rows → DUE and LEARNING
    // sections are empty.  The library holds thousands of not-yet-introduced
    // word senses, all owned through one set.
    tableData.user_progress = [];
    tableData.vocabulary_sets = [{ id: 'set-big', user_id: 'user-1' }];
    rpcData['get_user_set_learn_priorities'] = [{ set_id: 'set-big', learn_priority: 1 }];

    // Simulate a large library: 2500 NEW candidates from the RPC.
    const CANDIDATES = 2500;
    rpcData['get_new_words_for_session'] = Array.from({ length: CANDIDATES }, (_, i) => ({
      id: `new-${i}`,
      word: `word${i}`,
      meaning: `nghĩa ${i}`,
      state: 'new',
      set_id: 'set-big',
    }));

    const { queue, error } = await getLearnSessionQueue('user-1', {
      learnMode: 'LIMITED',
      setId: 'all',
      dailyNewLimit: 50,       // user's daily NEW quota
      introducedTodayCount: 0, // nothing introduced today yet
      sessionSize: 50,         // session size = daily cap in this scenario
    });

    expect(error).toBeNull();

    // 1) NEW candidates ARE present in the queue (not 0 NEW / 50 REVIEW).
    const newWords = queue.filter((w) => w.state === 'new');
    expect(newWords.length).toBeGreaterThan(0);

    // 2) The queue is capped at the session size (50) — never the full 2500.
    expect(queue.length).toBe(50);

    // 3) Not a single REVIEW word: with no user_progress the DUE/LEARNING
    //    sections are empty, and the NEW cards keep state 'new'.
    expect(queue.filter((w) => w.state === 'review')).toHaveLength(0);
    expect(newWords.length).toBe(50);

    // 4) The RPC was asked for exactly 50 (remaining size), proving the
    //    server-side cap and the daily quota line up.
    const newRpcCall = rpcImpl.mock.calls.find((c) => c[0] === 'get_new_words_for_session');
    expect(newRpcCall[1].p_limit).toBe(50);
  });

  it('Point 3: introduced-today quota reduces the NEW slice without touching REVIEW', async () => {
    tableData.user_progress = []; // nothing due/learning
    tableData.vocabulary_sets = [{ id: 'set-big', user_id: 'user-1' }];
    rpcData['get_user_set_learn_priorities'] = [{ set_id: 'set-big', learn_priority: 1 }];
    rpcData['get_new_words_for_session'] = Array.from({ length: 100 }, (_, i) => ({
      id: `n-${i}`, word: `w${i}`, meaning: `m${i}`, state: 'new', set_id: 'set-big',
    }));

    // 20 words already introduced today → only 30 more allowed (50 - 20).
    const { queue, error } = await getLearnSessionQueue('user-1', {
      learnMode: 'LIMITED',
      setId: 'all',
      dailyNewLimit: 50,
      introducedTodayCount: 20,
      sessionSize: 50,
    });

    expect(error).toBeNull();
    expect(queue.filter((w) => w.state === 'new')).toHaveLength(30);
    expect(queue.filter((w) => w.state === 'review')).toHaveLength(0);
    expect(queue).toHaveLength(30);
  });

  it('Point 3 trace: with 30 due REVIEWs + 2500 NEW, the session mixes REVIEW then NEW (remaining slice)', async () => {
    const now = Date.now();
    // 30 due reviews (past due), plus a large unlearned library.
    tableData.user_progress = Array.from({ length: 30 }, (_, i) => ({
      user_id: 'user-1',
      word_sense_id: `due-${i}`,
      state: 'review',
      review_due_at: new Date(now - 3600 * 1000).toISOString(),
      mastery_level: 2,
      word_senses: { id: `due-${i}`, meaning: `đã ôn ${i}`, words: { word: `dueword${i}` } },
    }));
    tableData.vocabulary_sets = [{ id: 'set-big', user_id: 'user-1' }];
    rpcData['get_user_set_learn_priorities'] = [{ set_id: 'set-big', learn_priority: 1 }];
    rpcData['get_new_words_for_session'] = Array.from({ length: 2500 }, (_, i) => ({
      id: `new-${i}`, word: `word${i}`, meaning: `nghĩa ${i}`, state: 'new', set_id: 'set-big',
    }));

    const { queue, error } = await getLearnSessionQueue('user-1', {
      learnMode: 'LIMITED',
      setId: 'all',
      dailyNewLimit: 50,
      introducedTodayCount: 0,
      sessionSize: 50,
    });

    expect(error).toBeNull();
    // DUE reviews take the front of the queue (priority: DUE → LEARNING → NEW).
    const reviewCount = queue.filter((w) => w.state === 'review').length;
    const newCount = queue.filter((w) => w.state === 'new').length;
    // The remaining 20 slots go to NEW candidates (never relabelled review).
    expect(reviewCount).toBe(30);
    expect(newCount).toBe(20);
    expect(queue).toHaveLength(50);

    // RPC p_limit reflects only the remaining slice (50 - 30 = 20).
    const newRpcCall = rpcImpl.mock.calls.find((c) => c[0] === 'get_new_words_for_session');
    expect(newRpcCall[1].p_limit).toBe(20);
  });
});
