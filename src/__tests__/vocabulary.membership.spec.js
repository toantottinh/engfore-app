import { describe, it, expect, vi, beforeEach } from 'vitest';

// Vocabulary membership source of truth: `set_words` + `vocabulary_sets`
// (NOT user_vocabulary). Memory Clue (word_senses.description) must be
// mapped through to the UI shape and must NEVER affect membership.

const rowsByTable = {
  set_words: [],
  vocabulary_sets: [],
  user_progress: [],
};

const rpcData = {};
const deleteCalls = [];

const resolvePathValues = (value, parts) => {
  if (value === undefined || value === null) return [];
  if (parts.length === 0) return [value];
  const [head, ...rest] = parts;
  if (Array.isArray(value)) {
    return value.flatMap((v) => resolvePathValues(v?.[head], rest));
  }
  return resolvePathValues(value?.[head], rest);
};

const chainableFrom = (tableName) => {
  const filters = [];
  const chain = {
    select() { return chain; },
    eq(col, val) { filters.push(['eq', col, val]); return chain; },
    in(col, vals) { filters.push(['in', col, vals]); return chain; },
    order() { return chain; },
    limit() { return chain; },
    maybeSingle: async () => ({ data: (rowsByTable[tableName] || [])[0] ?? null, error: null }),
    delete() { deleteCalls.push(tableName); return chain; },
    then(onFulfilled) {
      let data = [...(rowsByTable[tableName] || [])];
      for (const [op, col, val] of filters) {
        const parts = String(col).split('.');
        data = data.filter((row) =>
          resolvePathValues(row, parts).some((v) => (op === 'eq' ? v === val : (val || []).includes(v)))
        );
      }
      return Promise.resolve({ data, error: null }).then(onFulfilled);
    },
  };
  return chain;
};

vi.mock('../services/supabase.js', () => ({
  supabase: {
    from: (t) => chainableFrom(t),
    rpc: async (fn, args) => {
      const r = rpcData[fn]?.(args) ?? null;
      return { data: r?.data ?? null, error: r?.error ?? null };
    },
  },
}));

import { getUserVocabulary, deleteWordFromSet } from '../services/vocabulary.service.js';

const SENSE = (id, overrides = {}) => ({
  id,
  word_type: 'adjective',
  meaning: `nghĩa của ${id}`,
  description: 'description' in overrides ? overrides.description : `clue cho ${id}`,
  example: 'example' in overrides ? overrides.example : `Câu ví dụ ${id}.`,
  words: { id: `w-${id}`, word: id, ipa: '/ipa/', cefr_level: 'B1' },
});

describe('getUserVocabulary — set_words membership (source of truth)', () => {
  beforeEach(() => {
    rowsByTable.set_words = [];
    rowsByTable.vocabulary_sets = [];
    rowsByTable.user_progress = [];
    rpcData.remove_word_from_set = undefined;
  });

  it('TEST 1+2: word with Memory Clue is returned with the clue mapped from description', async () => {
    rowsByTable.set_words = [
      {
        set_id: 'set-a',
        word_sense_id: 'attractive',
        vocabulary_sets: [{ id: 'set-a', user_id: 'user-1' }],
        word_senses: SENSE('attractive', { description: 'Có sức hút với người khác' }),
      },
    ];

    const { data, error } = await getUserVocabulary('user-1');
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data[0].word).toBe('attractive');
    expect(data[0].memory_clue).toBe('Có sức hút với người khác');
    expect(data[0].meaning).toBe('nghĩa của attractive');
    expect(data[0].example).toBe('Câu ví dụ attractive.');
    expect(data[0].ipa).toBe('/ipa/');
    expect(data[0].cefr_level).toBe('B1');
  });

  it('TEST 3: word WITHOUT Memory Clue still appears in the library', async () => {
    rowsByTable.set_words = [
      {
        set_id: 'set-a',
        word_sense_id: 'plain',
        vocabulary_sets: [{ id: 'set-a', user_id: 'user-1' }],
        word_senses: SENSE('plain', { description: null }),
      },
    ];

    const { data, error } = await getUserVocabulary('user-1');
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data[0].memory_clue).toBe('');
  });
});

describe('getUserVocabulary — removal & multi-set cases', () => {
  beforeEach(() => {
    rowsByTable.set_words = [];
    rowsByTable.vocabulary_sets = [];
    rowsByTable.user_progress = [];
    rpcData.remove_word_from_set = undefined;
  });

  it('TEST 5: word removed from every set no longer appears in the library', async () => {
    // The membership row is gone (deleted set_words); nothing in the library.
    rowsByTable.set_words = [];

    const { data, error } = await getUserVocabulary('user-1');
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('TEST 6: word removed from Set A but still in Set B of the same user remains', async () => {
    rowsByTable.set_words = [
      {
        set_id: 'set-b',
        word_sense_id: 'attractive',
        vocabulary_sets: [{ id: 'set-b', user_id: 'user-1' }],
        word_senses: SENSE('attractive'),
      },
    ];

    const { data, error } = await getUserVocabulary('user-1');
    expect(error).toBeNull();
    expect(data.map((w) => w.word)).toEqual(['attractive']);
  });

  it('TEST 7: a word in two sets appears exactly once (dedup)', async () => {
    rowsByTable.vocabulary_sets = [
      { id: 'set-a', name: 'Set A', user_id: 'user-1' },
      { id: 'set-b', name: 'Set B', user_id: 'user-1' },
    ];
    rowsByTable.set_words = [
      {
        set_id: 'set-a',
        word_sense_id: 'attractive',
        vocabulary_sets: [{ id: 'set-a', user_id: 'user-1' }],
        word_senses: SENSE('attractive'),
      },
      {
        set_id: 'set-b',
        word_sense_id: 'attractive',
        vocabulary_sets: [{ id: 'set-b', user_id: 'user-1' }],
        word_senses: SENSE('attractive'),
      },
    ];

    const { data, error } = await getUserVocabulary('user-1');
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data[0].set_names.length).toBeGreaterThan(0);
  });
});

describe('deleteWordFromSet — RPC-backed removal with SRS cleanup', () => {
  beforeEach(() => {
    deleteCalls.length = 0;
  });

  it('delegates to remove_word_from_set with set + sense ids', async () => {
    let captured = null;
    rpcData.remove_word_from_set = (args) => {
      captured = args;
      return { data: { removed_set_links: 1, removed_progress: 1, removed_ownership: 1 } };
    };

    const { data, error } = await deleteWordFromSet('set-a', 'attractive');
    expect(error).toBeNull();
    expect(captured).toEqual({ p_set_id: 'set-a', p_word_sense_id: 'attractive' });
    expect(data.removed_set_links).toBe(1);
  });

  it('rejects missing ids without touching the DB', async () => {
    rpcData.remove_word_from_set = () => {
      throw new Error('RPC must not be called');
    };
    const { error } = await deleteWordFromSet(null, 'attractive');
    expect(error).toBeDefined();
  });

  it('falls back to a plain set_words delete when the RPC is missing (migration gap)', async () => {
    rpcData.remove_word_from_set = () => ({
      // Simulate "function does not exist yet" (Postgres 42883).
      error: { code: '42883', message: 'function remove_word_from_set does not exist' },
    });
    const { error } = await deleteWordFromSet('set-a', 'attractive');
    expect(error).toBeNull();
    expect(deleteCalls).toEqual(['set_words']);
  });
});
