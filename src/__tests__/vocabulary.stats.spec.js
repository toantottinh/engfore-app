import { describe, it, expect, vi, beforeEach } from 'vitest';

// Tests for the SINGLE-SOURCE-OF-TRUTH vocabulary stats (Part A) and the
// learn_priority ordering of vocabulary sets (Part B).

const countsByTable = { user_vocabulary: 5, user_progress: 2 };
const rowsByTable = { vocabulary_sets: [] };
const rpcData = {};

const chainableFrom = (tableName) => {
  const filters = [];
  let countHead = null;
  const chain = {
    select(col, opts) {
      if (opts && opts.count === 'exact' && opts.head === true) countHead = true;
      return chain;
    },
    eq(col, val) { filters.push(['eq', col, val]); return chain; },
    in(col, vals) { filters.push(['in', col, vals]); return chain; },
    order() { return chain; },
    limit() { return chain; },
    maybeSingle: async () => ({ data: (rowsByTable[tableName] || [])[0] ?? null, error: null }),
    then(onFulfilled) {
      if (countHead) {
        const rows = rowsByTable[tableName] || [];
        const count = filters.every(([op, col, val]) => op !== 'eq' || rows.every((r) => r[col] === val))
          ? (countsByTable[tableName] ?? 0)
          : 0;
        return Promise.resolve({ data: [], count, error: null }).then(onFulfilled);
      }
      let data = [...(rowsByTable[tableName] || [])];
      for (const [op, col, val] of filters) {
        data = data.filter((row) => (row[col] === undefined || row[col] === null) ? false : (op === 'eq' ? row[col] === val : true));
      }
      return Promise.resolve({ data, error: null }).then(onFulfilled);
    },
  };
  return chain;
};

vi.mock('../services/supabase.js', () => ({
  supabase: { from: (t) => chainableFrom(t), rpc: async (fn) => ({ data: rpcData[fn] ?? null, error: null }) },
}));

import { getVocabularyStats } from '../services/learning.service.js';
import { getVocabularySets } from '../services/vocabulary.service.js';

describe('getVocabularyStats SINGLE SOURCE OF TRUTH (Part A)', () => {
  beforeEach(() => {
    countsByTable.user_vocabulary = 5;
    countsByTable.user_progress = 2;
    rowsByTable.vocabulary_sets = [];
    rpcData['get_user_set_learn_priorities'] = [];
  });

  it('returns total + learning counts from direct count-head queries', async () => {
    const { data, error } = await getVocabularyStats('user-1');
    expect(error).toBeNull();
    expect(data).toEqual({ total_count: 5, learning_count: 2 });
  });

  it('does NOT call the legacy get_user_vocabulary_stats RPC', async () => {
    const supabaseModule = await import('../services/supabase.js');
    const rpcSpy = vi.spyOn(supabaseModule.supabase, 'rpc');
    await getVocabularyStats('user-1');
    expect(rpcSpy).not.toHaveBeenCalled();
  });
});

describe('getVocabularySets learn_priority ordering (Part B)', () => {
  beforeEach(() => {
    rowsByTable.vocabulary_sets = [];
    rpcData['get_user_set_learn_priorities'] = [];
  });

  it('orders sets by learn_priority (lower first) and attaches learn_priority', async () => {
    rowsByTable.vocabulary_sets = [
      { id: 'b', name: 'Family', user_id: 'user-1', created_at: '2026-08-01T00:00:00.000Z', set_words: [{ count: 10 }] },
      { id: 'a', name: 'A1', user_id: 'user-1', created_at: '2026-08-02T00:00:00.000Z', set_words: [{ count: 20 }] },
    ];
    rpcData['get_user_set_learn_priorities'] = [
      { set_id: 'a', learn_priority: 1 },
      { set_id: 'b', learn_priority: 2 },
    ];

    const { data, error } = await getVocabularySets('user-1');
    expect(error).toBeNull();
    expect(data.map((s) => s.name)).toEqual(['A1', 'Family']);
    expect(data.find((s) => s.id === 'a').learn_priority).toBe(1);
    expect(data.find((s) => s.id === 'b').learn_priority).toBe(2);
  });

  it('defaults sets without a priority entry to 999 (append at end)', async () => {
    rowsByTable.vocabulary_sets = [
      { id: 'prioritized', name: 'Prioritized', user_id: 'user-1', created_at: '2026-08-01T00:00:00.000Z', set_words: [{ count: 1 }] },
      { id: 'unprioritized', name: 'New Set', user_id: 'user-1', created_at: '2026-08-02T00:00:00.000Z', set_words: [{ count: 1 }] },
    ];
    rpcData['get_user_set_learn_priorities'] = [{ set_id: 'prioritized', learn_priority: 1 }];

    const { data } = await getVocabularySets('user-1');
    expect(data.map((s) => s.id)).toEqual(['prioritized', 'unprioritized']);
    expect(data.find((s) => s.id === 'unprioritized').learn_priority).toBe(999);
  });
});
