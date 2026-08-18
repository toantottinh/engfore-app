import { describe, it, expect, vi, beforeEach } from 'vitest';

// Tests for the SINGLE-SOURCE-OF-TRUTH vocabulary stats (Part A) and the
// learn_priority ordering of vocabulary sets (Part B).

const countsByTable = { user_vocabulary: 5, user_progress: 2 };
const rowsByTable = { vocabulary_sets: [] };
const rpcData = {};
const upsertsByTable = {};
const insertsByTable = {};

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
    insert(rows) {
      (insertsByTable[tableName] = insertsByTable[tableName] || []).push({ rows });
      return chain;
    },
    upsert(rows, opts) {
      (upsertsByTable[tableName] = upsertsByTable[tableName] || []).push({ rows, opts });
      const result = { data: null, error: null };
      return {
        then(onFulfilled) { return Promise.resolve(result).then(onFulfilled); },
        catch(onRejected) { return Promise.resolve(result).catch(onRejected); },
      };
    },
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
import {
  getVocabularySets,
  createVocabularySet,
  reorderVocabularySets,
} from '../services/vocabulary.service.js';

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

  it('tiebreaks equal learn_priority by created_at ASC then id ASC', async () => {
    rowsByTable.vocabulary_sets = [
      { id: 'newer', name: 'Newer', user_id: 'user-1', created_at: '2026-08-02T00:00:00.000Z', set_words: [{ count: 1 }] },
      { id: 'older', name: 'Older', user_id: 'user-1', created_at: '2026-08-01T00:00:00.000Z', set_words: [{ count: 1 }] },
    ];
    rpcData['get_user_set_learn_priorities'] = [
      { set_id: 'older', learn_priority: 1 },
      { set_id: 'newer', learn_priority: 1 },
    ];

    const { data, error } = await getVocabularySets('user-1');
    expect(error).toBeNull();
    // Same priority (1): older created_at wins → Older before Newer.
    expect(data.map((s) => s.id)).toEqual(['older', 'newer']);
  });
});

describe('reorderVocabularySets — ownership validation + normalized priorities', () => {
  beforeEach(() => {
    rowsByTable.vocabulary_sets = [];
    rpcData['get_user_set_learn_priorities'] = [];
    for (const key of Object.keys(upsertsByTable)) delete upsertsByTable[key];
    for (const key of Object.keys(insertsByTable)) delete insertsByTable[key];
  });

  it('a new set gets a default learn_priority entry appended at the end (999)', async () => {
    rowsByTable.vocabulary_sets = [
      { id: 'new-set', name: 'New Set', user_id: 'user-1', created_at: '2026-08-10T00:00:00.000Z' },
    ];

    const { data, error } = await createVocabularySet({ name: 'New Set', description: null, userId: 'user-1' });
    expect(error).toBeNull();
    expect(data.id).toBe('new-set');

    // The set is created with a non-breaking default priority: 999 (end of
    // the learning order) — never before sets the user has already ordered.
    const upserts = upsertsByTable['user_set_learn_priority'];
    expect(upserts).toBeDefined();
    expect(upserts[0].rows).toEqual({ user_id: 'user-1', set_id: 'new-set', learn_priority: 999 });
  });

  it('persists the new order with contiguous 1..N priorities (atomic upsert)', async () => {
    rowsByTable.vocabulary_sets = [
      { id: 'set-a', user_id: 'user-1' },
      { id: 'set-b', user_id: 'user-1' },
      { id: 'set-c', user_id: 'user-1' },
    ];

    const { error } = await reorderVocabularySets('user-1', ['set-c', 'set-a', 'set-b']);
    expect(error).toBeNull();

    const upserts = upsertsByTable['user_set_learn_priority'];
    expect(upserts).toBeDefined();
    expect(upserts.length).toBe(1); // one atomic upsert
    const rows = upserts[0].rows;
    expect(rows).toEqual([
      { user_id: 'user-1', set_id: 'set-c', learn_priority: 1 },
      { user_id: 'user-1', set_id: 'set-a', learn_priority: 2 },
      { user_id: 'user-1', set_id: 'set-b', learn_priority: 3 },
    ]);
  });

  it('rejects a set that belongs to ANOTHER user (no DB write happens)', async () => {
    rowsByTable.vocabulary_sets = [
      { id: 'set-a', user_id: 'user-1' },
      // set-b is owned by another user.
      { id: 'set-b', user_id: 'user-2' },
    ];

    const { error } = await reorderVocabularySets('user-1', ['set-a', 'set-b']);
    expect(error).not.toBeNull();
    expect(String(error.message)).toContain('không thuộc về bạn');
    // Ownership check failed BEFORE any write: no priority upsert occurred.
    expect(upsertsByTable['user_set_learn_priority']).toBeUndefined();
  });

  it('rejects an unknown/nonexistent set id without writing anything', async () => {
    rowsByTable.vocabulary_sets = [{ id: 'set-a', user_id: 'user-1' }];

    const { error } = await reorderVocabularySets('user-1', ['set-a', 'ghost-set']);
    expect(error).not.toBeNull();
    expect(upsertsByTable['user_set_learn_priority']).toBeUndefined();
  });

  it('rejects an empty / non-array input', async () => {
    const empty = await reorderVocabularySets('user-1', []);
    expect(empty.error).not.toBeNull();
    const notArray = await reorderVocabularySets('user-1', null);
    expect(notArray.error).not.toBeNull();
    expect(upsertsByTable['user_set_learn_priority']).toBeUndefined();
  });

  it('rejects when userId is missing', async () => {
    const { error } = await reorderVocabularySets('', ['set-a']);
    expect(error).not.toBeNull();
  });

  it('rejects a duplicated set id without writing anything', async () => {
    rowsByTable.vocabulary_sets = [{ id: 'set-a', user_id: 'user-1' }];
    const { error } = await reorderVocabularySets('user-1', ['set-a', 'set-a']);
    expect(error).not.toBeNull();
    expect(String(error.message)).toContain('trùng lặp');
    expect(upsertsByTable['user_set_learn_priority']).toBeUndefined();
  });
});
