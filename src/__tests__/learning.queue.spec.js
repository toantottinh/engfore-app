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

// Embedded membership structures (what PostgREST resolves for the
// `word_senses.set_words(vocabulary_sets(user_id))` embed). A row is
// "owned" only when at least one link reaches a vocabulary_sets row of
// the user — exactly the inner-join semantics the production filter uses.
const OWNED_SET_WORDS = [{ set_id: 'set-owned', vocabulary_sets: [{ user_id: 'user-1' }] }];

// Table data returned by the mocked client (per table name).
const tableData = {
  user_progress: [],
  vocabulary_sets: [],
  set_words: [],
};

// RPC responses, keyed by function name.
const rpcData = {};

// Resolve a (possibly dotted) PostgREST column path against a row,
// fanning out across embedded arrays. E.g. `word_senses.set_words` is an
// array, so `word_senses.set_words.vocabulary_sets.user_id` yields every
// user_id reachable through any link. An orphan row (empty/missing
// set_words) yields NO values → never matches → never returned, which is
// exactly the production inner-join behaviour we rely on.
const resolvePathValues = (value, parts) => {
  if (value === undefined || value === null) return [];
  if (parts.length === 0) return [value];
  const [head, ...rest] = parts;
  if (Array.isArray(value)) {
    return value.flatMap((v) => resolvePathValues(v?.[head], rest));
  }
  return resolvePathValues(value?.[head], rest);
};

const matchesOp = (rowVal, op, val) => {
  switch (op) {
    case 'eq': return rowVal === val;
    case 'in': return (val || []).includes(rowVal);
    case 'lte': return new Date(rowVal).getTime() <= new Date(val).getTime();
    case 'gt': return new Date(rowVal).getTime() > new Date(val).getTime();
    default: return true;
  }
};

const chainableFrom = (tableName) => {
  // Track filters applied (eq/in/lte/gt/filter) so the mock surfaces the
  // actual SQL constraints the production queries use. This lets us assert
  // that the DUE/LEARNING state, timing AND vocabulary-membership filters
  // behave correctly.
  const filters = [];
  let selectOpts = null;
  const chain = {
    select(_selectText, opts) { selectOpts = opts || null; return chain; },
    eq(col, val) { filters.push(['eq', col, val]); return chain; },
    in(col, vals) { filters.push(['in', col, vals]); return chain; },
    lte(col, val) { filters.push(['lte', col, val]); return chain; },
    gt(col, val) { filters.push(['gt', col, val]); return chain; },
    filter(col, op, val) { filters.push(['filter', col, op, val]); return chain; },
    order() { return chain; },
    limit() { return chain; },
    maybeSingle: async () => ({ data: (tableData[tableName] || [])[0] ?? null, error: null }),
    upsert: async () => ({ data: null, error: null }),
    then(onFulfilled) {
      let data = [...(tableData[tableName] || [])];
      for (const entry of filters) {
        const [op, col, val] = entry;
        const effectiveOp = op === 'filter' ? entry[2] : op;
        const effectiveVal = op === 'filter' ? entry[3] : val;
        const parts = String(col).split('.');
        data = data.filter((row) =>
          resolvePathValues(row, parts).some((v) => matchesOp(v, effectiveOp, effectiveVal))
        );
      }
      const result = { data: selectOpts?.head ? null : data, error: null };
      if (selectOpts?.count === 'exact') result.count = data.length;
      return Promise.resolve(result).then(onFulfilled);
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

import {
  getLearnSessionQueue,
  getDueReviewWords,
  getDueReviewWordsCount,
  getLearningWords,
} from '../services/learning.service.js';

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
        word_senses: { set_words: OWNED_SET_WORDS, id: 'due-1', meaning: 'due meaning', words: { word: 'dueword' } },
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
      p_limit: null,
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
        word_senses: { set_words: OWNED_SET_WORDS, id: 'graduated-1', meaning: 'graduated', words: { word: 'graduated' } },
      },
      // A card genuinely still in an active 'learning' step, due in 10 min.
      {
        user_id: 'user-1',
        word_sense_id: 'learning-1',
        state: 'learning',
        review_due_at: new Date(now + 10 * 60 * 1000).toISOString(),
        mastery_level: 1,
        word_senses: { set_words: OWNED_SET_WORDS, id: 'learning-1', meaning: 'learning', words: { word: 'learning' } },
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
        word_senses: { set_words: OWNED_SET_WORDS, id: 'just-due', meaning: 'due', words: { word: 'due' } },
      },
      // Clearly in the future → belongs in LEARNING, not DUE.
      {
        user_id: 'user-1',
        word_sense_id: 'just-future',
        state: 'learning',
        review_due_at: new Date(now + 10 * 60 * 1000).toISOString(),
        mastery_level: 1,
        word_senses: { set_words: OWNED_SET_WORDS, id: 'just-future', meaning: 'future', words: { word: 'future' } },
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
      word_senses: { set_words: OWNED_SET_WORDS, id: `due-${i}`, meaning: `đã ôn ${i}`, words: { word: `dueword${i}` } },
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

  it('NEW order: priorities 0,1,2 map to set order A→B→C (0 = learned first)', async () => {
    // Spec example: Set A = 0, Set B = 1, Set C = 2.
    tableData.vocabulary_sets = [
      { id: 'set-c', user_id: 'user-1', created_at: '2026-08-03T00:00:00.000Z' },
      { id: 'set-a', user_id: 'user-1', created_at: '2026-08-01T00:00:00.000Z' },
      { id: 'set-b', user_id: 'user-1', created_at: '2026-08-02T00:00:00.000Z' },
    ];
    rpcData['get_user_set_learn_priorities'] = [
      { set_id: 'set-a', learn_priority: 0 },
      { set_id: 'set-b', learn_priority: 1 },
      { set_id: 'set-c', learn_priority: 2 },
    ];
    rpcData['get_new_words_for_session'] = [
      { id: 'wa', word: 'a', meaning: 'A', state: 'new', set_id: 'set-a' },
      { id: 'wb', word: 'b', meaning: 'B', state: 'new', set_id: 'set-b' },
      { id: 'wc', word: 'c', meaning: 'C', state: 'new', set_id: 'set-c' },
    ];

    const { queue, error } = await getLearnSessionQueue('user-1', {
      learnMode: 'UNLIMITED',
      setId: 'all',
      dailyNewLimit: 50,
      introducedTodayCount: 0,
      sessionSize: 50,
    });

    expect(error).toBeNull();
    // New words enter the queue in priority order A (0), B (1), C (2).
    expect(queue.map((w) => w.id)).toEqual(['wa', 'wb', 'wc']);

    const newRpcCall = rpcImpl.mock.calls.find((c) => c[0] === 'get_new_words_for_session');
    expect(newRpcCall[1].p_set_ids_prioritized).toEqual(['set-a', 'set-b', 'set-c']);
  });

  it('falls back to created_at ASC (then id) when priorities are equal/absent', async () => {
    // Both sets lack a priority entry (999) — the order must stay deterministic:
    // created_at ASC, then id ASC (never an arbitrary DB ordering).
    tableData.vocabulary_sets = [
      { id: 'newer', user_id: 'user-1', created_at: '2026-08-02T00:00:00.000Z' },
      { id: 'older', user_id: 'user-1', created_at: '2026-08-01T00:00:00.000Z' },
    ];
    rpcData['get_user_set_learn_priorities'] = [];
    rpcData['get_new_words_for_session'] = [
      { id: 'old-word', word: 'old', meaning: 'old', state: 'new', set_id: 'older' },
    ];

    const { queue, error } = await getLearnSessionQueue('user-1', {
      learnMode: 'UNLIMITED',
      setId: 'all',
      dailyNewLimit: 50,
      introducedTodayCount: 0,
      sessionSize: 50,
    });

    expect(error).toBeNull();
    const newRpcCall = rpcImpl.mock.calls.find((c) => c[0] === 'get_new_words_for_session');
    expect(newRpcCall[1].p_set_ids_prioritized).toEqual(['older', 'newer']);
  });

  it('Rule 4: a word in multiple sets appears ONCE in the queue', async () => {
    // Even if the RPC returned duplicates (the legacy behaviour before the SQL
    // DISTINCT ON fix), the queue builder never creates a duplicate item.
    tableData.vocabulary_sets = [
      { id: 'set-a', user_id: 'user-1' },
      { id: 'set-b', user_id: 'user-1' },
    ];
    rpcData['get_user_set_learn_priorities'] = [
      { set_id: 'set-a', learn_priority: 1 },
      { set_id: 'set-b', learn_priority: 2 },
    ];
    // Word X belongs to BOTH set-a and set-b; the pre-fix RPC returned it twice.
    rpcData['get_new_words_for_session'] = [
      { id: 'x', word: 'X', meaning: 'X both sets', state: 'new', set_id: 'set-a' },
      { id: 'x', word: 'X', meaning: 'X both sets', state: 'new', set_id: 'set-b' },
      { id: 'y', word: 'Y', meaning: 'Y only', state: 'new', set_id: 'set-b' },
    ];

    const { queue, error } = await getLearnSessionQueue('user-1', {
      learnMode: 'UNLIMITED',
      setId: 'all',
      dailyNewLimit: 50,
      introducedTodayCount: 0,
      sessionSize: 50,
    });

    expect(error).toBeNull();
    const ids = queue.map((w) => w.id);
    expect(ids).toEqual(['x', 'y']);
    // Strict uniqueness — no duplicate learning item in the queue.
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('Rule 1: due REVIEW is never pushed back by set priority', async () => {
    // A due word lives in set-b (priority 2 — "học sau"), while a NEW word
    // lives in set-a (priority 0 — "học trước").  SRS scheduling must win:
    // the due review still enters the queue FIRST.
    const now = Date.now();
    tableData.user_progress = [
      {
        user_id: 'user-1',
        word_sense_id: 'due-b',
        state: 'review',
        review_due_at: new Date(now - 3600 * 1000).toISOString(),
        mastery_level: 2,
        word_senses: { set_words: OWNED_SET_WORDS, id: 'due-b', meaning: 'due in low-priority set', words: { word: 'dueb' } },
      },
    ];
    tableData.vocabulary_sets = [
      { id: 'set-a', user_id: 'user-1' },
      { id: 'set-b', user_id: 'user-1' },
    ];
    rpcData['get_user_set_learn_priorities'] = [
      { set_id: 'set-a', learn_priority: 0 },
      { set_id: 'set-b', learn_priority: 2 },
    ];
    rpcData['get_new_words_for_session'] = [
      { id: 'new-a', word: 'newa', meaning: 'new in high-priority set', state: 'new', set_id: 'set-a' },
    ];

    const { queue, error } = await getLearnSessionQueue('user-1', {
      learnMode: 'UNLIMITED',
      setId: 'all',
      dailyNewLimit: 50,
      introducedTodayCount: 0,
      sessionSize: 50,
    });

    expect(error).toBeNull();
    expect(queue.map((w) => w.id)).toEqual(['due-b', 'new-a']);
  });

  it('set-specific learning: only words of the chosen set enter the queue', async () => {
    const now = Date.now();
    // set-a owns due-a + learning-a; set-b owns due-b + learning-b.
    tableData.set_words = [
      { set_id: 'set-a', word_sense_id: 'due-a' },
      { set_id: 'set-a', word_sense_id: 'learning-a' },
      { set_id: 'set-b', word_sense_id: 'due-b' },
      { set_id: 'set-b', word_sense_id: 'learning-b' },
    ];
    tableData.user_progress = [
      { user_id: 'user-1', word_sense_id: 'due-a', state: 'review', review_due_at: new Date(now - 1000).toISOString(), mastery_level: 2, word_senses: { set_words: OWNED_SET_WORDS, id: 'due-a', meaning: 'due A', words: { word: 'duea' } } },
      { user_id: 'user-1', word_sense_id: 'due-b', state: 'review', review_due_at: new Date(now - 1000).toISOString(), mastery_level: 2, word_senses: { set_words: OWNED_SET_WORDS, id: 'due-b', meaning: 'due B', words: { word: 'dueb' } } },
      { user_id: 'user-1', word_sense_id: 'learning-a', state: 'learning', review_due_at: new Date(now + 3600 * 1000).toISOString(), mastery_level: 1, word_senses: { set_words: OWNED_SET_WORDS, id: 'learning-a', meaning: 'learn A', words: { word: 'learna' } } },
      { user_id: 'user-1', word_sense_id: 'learning-b', state: 'learning', review_due_at: new Date(now + 3600 * 1000).toISOString(), mastery_level: 1, word_senses: { set_words: OWNED_SET_WORDS, id: 'learning-b', meaning: 'learn B', words: { word: 'learnb' } } },
    ];
    tableData.vocabulary_sets = [];
    // The NEW RPC is scoped to the chosen set (server-side enforcement);
    // it must never pull set-b candidates.
    rpcData['get_new_words_for_session'] = [
      { id: 'new-a', word: 'newa', meaning: 'new A', state: 'new', set_id: 'set-a' },
    ];

    const { queue, error } = await getLearnSessionQueue('user-1', {
      learnMode: 'UNLIMITED',
      setId: 'set-a',
      dailyNewLimit: 50,
      introducedTodayCount: 0,
      sessionSize: 50,
    });

    expect(error).toBeNull();
    const ids = queue.map((w) => w.id);
    expect(ids).toEqual(['due-a', 'learning-a', 'new-a']);

    // NEW selection was scoped to the chosen set only (no cross-set leak).
    const newRpcCall = rpcImpl.mock.calls.find((c) => c[0] === 'get_new_words_for_session');
    expect(newRpcCall[1].p_set_ids_prioritized).toEqual(['set-a']);
  });

  // ------------------------------------------------------------------
  // Vocabulary ↔ SRS membership: set_words + vocabulary_sets is the
  // source of truth. A word_sense whose user_progress row has NO
  // set_words link left (removed from Vocabulary) must never surface
  // in the SRS queues — DUE, LEARNING, NEW or the due badge count.
  // ------------------------------------------------------------------

  it('TEST 5+8+10: removed word (no set_words left) is excluded from DUE; NEW still flows', async () => {
    const now = Date.now();
    // The user still owns one set (holding the NEW word)…
    tableData.vocabulary_sets = [{ id: 'set-owned', user_id: 'user-1' }];
    rpcData['get_user_set_learn_priorities'] = [{ set_id: 'set-owned', learn_priority: 1 }];
    rpcData['get_new_words_for_session'] = [
      { id: 'n1', word: 'alive', meaning: 'still in a set', state: 'new', set_id: 'set-owned' },
    ];

    tableData.user_progress = [
      {
        // Attractive was removed from every set → set_words embed empty.
        user_id: 'user-1',
        word_sense_id: 'attractive',
        state: 'review',
        review_due_at: new Date(now - 1000).toISOString(),
        mastery_level: 2,
        word_senses: { id: 'attractive', meaning: 'hấp dẫn', words: { word: 'attractive' }, set_words: [] },
      },
      {
        // A word the user still owns through set_words.
        user_id: 'user-1',
        word_sense_id: 'owned-1',
        state: 'review',
        review_due_at: new Date(now - 2000).toISOString(),
        mastery_level: 3,
        word_senses: { id: 'owned-1', meaning: 'owned', words: { word: 'owned' }, set_words: OWNED_SET_WORDS },
      },
    ];

    const { queue, error } = await getLearnSessionQueue('user-1', {
      learnMode: 'LIMITED', setId: 'all', dailyNewLimit: 10, introducedTodayCount: 0, sessionSize: 50,
    });
    expect(error).toBeNull();
    // DUE section keeps only the owned word; the removed word never re-enters.
    expect(queue.map((w) => w.id)).toEqual(['owned-1', 'n1']);
    expect(queue.some((w) => w.id === 'attractive')).toBe(false);

    // getDueReviewWords also drops the orphan.
    const { data: due } = await getDueReviewWords('user-1', 50);
    expect(due.map((w) => w.id)).toEqual(['owned-1']);

    // The due badge count ignores orphaned progress.
    const { count } = await getDueReviewWordsCount('user-1');
    expect(count).toBe(1);
  });

  it('TEST 9: a removed word still in its LEARNING step is excluded from the LEARNING queue', async () => {
    const now = Date.now();
    tableData.vocabulary_sets = [];
    rpcData['get_new_words_for_session'] = [];

    tableData.user_progress = [
      {
        user_id: 'user-1',
        word_sense_id: 'orphan-learning',
        state: 'learning',
        review_due_at: new Date(now + 10 * 60 * 1000).toISOString(),
        mastery_level: 1,
        word_senses: { id: 'orphan-learning', meaning: 'orphan learning', words: { word: 'orphl' }, set_words: [] },
      },
      {
        user_id: 'user-1',
        word_sense_id: 'owned-learning',
        state: 'learning',
        review_due_at: new Date(now + 20 * 60 * 1000).toISOString(),
        mastery_level: 1,
        word_senses: { id: 'owned-learning', meaning: 'owned learning', words: { word: 'ownl' }, set_words: OWNED_SET_WORDS },
      },
    ];

    const { data: learning } = await getLearningWords('user-1', null, 50);
    expect(learning.map((w) => w.id)).toEqual(['owned-learning']);
  });

  it('TEST 6: word removed from Set A but still in Set B stays in the SRS queue', async () => {
    const now = Date.now();
    tableData.vocabulary_sets = [];
    rpcData['get_new_words_for_session'] = [];

    tableData.user_progress = [
      {
        user_id: 'user-1',
        word_sense_id: 'attractive',
        state: 'review',
        review_due_at: new Date(now - 1000).toISOString(),
        mastery_level: 2,
        word_senses: {
          id: 'attractive',
          meaning: 'hấp dẫn',
          words: { word: 'attractive' },
          // Removed from the user's Set A (link gone), but Set B of the SAME
          // user still holds it; a link to another user's set must NOT
          // grant ownership.
          set_words: [
            { set_id: 'set-b', vocabulary_sets: [{ user_id: 'user-1' }] },
            { set_id: 'set-other-user', vocabulary_sets: [{ user_id: 'user-2' }] },
          ],
        },
      },
    ];

    const { queue, error } = await getLearnSessionQueue('user-1', {
      learnMode: 'LIMITED', setId: 'all', dailyNewLimit: 10, introducedTodayCount: 0, sessionSize: 50,
    });
    expect(error).toBeNull();
    expect(queue.map((w) => w.id)).toEqual(['attractive']);

    const { count } = await getDueReviewWordsCount('user-1');
    expect(count).toBe(1);
  });

  it('TEST 7: a word_sense held by two sets appears exactly ONCE in the queue', async () => {
    const now = Date.now();
    tableData.vocabulary_sets = [];
    rpcData['get_new_words_for_session'] = [];

    tableData.user_progress = [
      {
        user_id: 'user-1',
        word_sense_id: 'shared',
        state: 'review',
        review_due_at: new Date(now - 1000).toISOString(),
        mastery_level: 2,
        word_senses: {
          id: 'shared',
          meaning: 'in two sets',
          words: { word: 'shared' },
          set_words: [
            { set_id: 'set-a', vocabulary_sets: [{ user_id: 'user-1' }] },
            { set_id: 'set-b', vocabulary_sets: [{ user_id: 'user-1' }] },
          ],
        },
      },
    ];

    const { queue, error } = await getLearnSessionQueue('user-1', {
      learnMode: 'LIMITED', setId: 'all', dailyNewLimit: 10, introducedTodayCount: 0, sessionSize: 50,
    });
    expect(error).toBeNull();
    const ids = queue.map((w) => w.id);
    expect(ids).toEqual(['shared']);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('TEST 1+3: Memory Clue travels through SRS rows; missing clue never filters a word out', async () => {
    const now = Date.now();
    tableData.vocabulary_sets = [];
    rpcData['get_new_words_for_session'] = [];

    tableData.user_progress = [
      {
        user_id: 'user-1',
        word_sense_id: 'with-clue',
        state: 'review',
        review_due_at: new Date(now - 1000).toISOString(),
        mastery_level: 2,
        word_senses: {
          id: 'with-clue',
          meaning: 'hấp dẫn',
          description: 'Có sức hút với người khác',
          words: { word: 'attractive' },
          set_words: OWNED_SET_WORDS,
        },
      },
      {
        user_id: 'user-1',
        word_sense_id: 'no-clue',
        state: 'review',
        review_due_at: new Date(now - 2000).toISOString(),
        mastery_level: 2,
        word_senses: {
          id: 'no-clue',
          meaning: 'không có clue',
          words: { word: 'noclue' },
          set_words: OWNED_SET_WORDS,
        },
      },
    ];

    const { data: due, error } = await getDueReviewWords('user-1', 50);
    expect(error).toBeNull();
    const withClue = due.find((w) => w.id === 'with-clue');
    const noClue = due.find((w) => w.id === 'no-clue');
    // The clue is preserved end-to-end…
    expect(withClue.memory_clue).toBe('Có sức hút với người khác');
    // …and its ABSENCE never filters a word out of the queue (TEST 3).
    expect(noClue).toBeDefined();
    expect(noClue.memory_clue).toBe('');
  });
});
