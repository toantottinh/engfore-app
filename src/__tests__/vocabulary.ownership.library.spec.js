import { describe, it, expect, vi, beforeEach } from 'vitest';

// =====================================================================
// Ownership-based Vocabulary Library + 2 DELETE semantics (service level)
//
// READ PATH: getUserVocabulary(userId) — base table = user_vocabulary
// (ownership source of truth, live-verified HTTP 200 on production).
// set_words ⋈ vocabulary_sets chỉ là membership metadata (set_names);
// KHÔNG quyết định ownership → orphan ownership VẪN hiển thị (Case A).
//
// DELETE A "Xóa khỏi kho":  removeWordCompletely → RPC remove_from_vocabulary
//                           (production, live-verified) — xóa ownership +
//                           SRS + mọi set membership của user.
// DELETE B "Xóa khỏi bộ từ": removeWordFromSet → RPC unlink_word_from_set
//                           (migration 20260911000000, local-only) — chỉ gỡ
//                           membership (set_words) của (set, sense) trên Set
//                           thuộc user; GIỮ nguyên user_vocabulary +
//                           user_progress.
// =====================================================================

const rowsByTable = {
  user_vocabulary: [],
  vocabulary_sets: [],
  set_words: [],
  user_progress: [],
};

const rpcCalls = [];
const rpcHandlers = {};
const deleteCalls = [];

const SENSE = (id, overrides = {}) => ({
  id,
  word_type: 'noun',
  meaning: overrides.meaning ?? `nghĩa của ${id}`,
  description: 'description' in overrides ? overrides.description : 'GLOBAL CLUE',
  example: 'example' in overrides ? overrides.example : 'GLOBAL EXAMPLE',
  words: { id: `w-${id}`, word: id, ipa: '/ipa/', cefr_level: 'B1' },
});

const UV = (userId, senseId, overrides = {}) => ({
  user_id: userId,
  word_sense_id: senseId,
  example: 'example' in overrides ? overrides.example : null,
  memory_clue: 'memory_clue' in overrides ? overrides.memory_clue : null,
  created_at: '2026-09-01T00:00:00.000Z',
  word_senses: SENSE(senseId, overrides),
});

const chainableFrom = (tableName) => {
  const filters = [];
  const chain = {
    select() { return chain; },
    eq(col, val) { filters.push(['eq', col, val]); return chain; },
    in(col, vals) { filters.push(['in', col, vals]); return chain; },
    order() { return chain; },
    limit() { return chain; },
    delete() { deleteCalls.push(tableName); return chain; },
    then(onFulfilled) {
      let data = [...(rowsByTable[tableName] || [])];
      for (const [op, col, val] of filters) {
        data = data.filter((row) => {
          const actual = col.split('.').reduce((acc, part) => (acc == null ? acc : acc[part]), row);
          return op === 'eq' ? actual === val : (val || []).includes(actual);
        });
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
      rpcCalls.push([fn, args]);
      const handler = rpcHandlers[fn];
      if (!handler) return { data: null, error: null };
      const res = await handler(args);
      return res ?? { data: null, error: null };
    },
  },
}));

import {
  getUserVocabulary,
  removeWordCompletely,
  removeWordFromSet,
} from '../services/vocabulary.service.js';

const RESET = () => {
  rowsByTable.user_vocabulary = [];
  rowsByTable.vocabulary_sets = [];
  rowsByTable.set_words = [];
  rowsByTable.user_progress = [];
  rpcCalls.length = 0;
  deleteCalls.length = 0;
  delete rpcHandlers.remove_from_vocabulary;
  delete rpcHandlers.unlink_word_from_set;
};

describe('READ PATH — user_vocabulary là ownership source của Kho từ', () => {
  beforeEach(RESET);

  it('Case A — orphan ownership: user_vocabulary=1, set_words=0 → Kho từ hiển thị 1 từ', async () => {
    rowsByTable.user_vocabulary = [UV('user-1', 'apple')];

    const { data, error } = await getUserVocabulary('user-1');
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data[0].word).toBe('apple');
    expect(data[0].set_names).toEqual([]);
  });

  it('Case B — user_vocabulary=1 + set_words=1 → Kho=1, Set=1', async () => {
    rowsByTable.user_vocabulary = [UV('user-1', 'apple')];
    rowsByTable.vocabulary_sets = [{ id: 'set-a', name: 'Set A', user_id: 'user-1' }];
    rowsByTable.set_words = [{ set_id: 'set-a', word_sense_id: 'apple' }];

    const { data, error } = await getUserVocabulary('user-1');
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data[0].set_names).toEqual(['Set A']);
  });

  it('Case C — user_vocabulary=1 + set_words=3 → Kho=1 (không duplicate), set_names=3', async () => {
    rowsByTable.user_vocabulary = [UV('user-1', 'apple')];
    rowsByTable.vocabulary_sets = [
      { id: 'set-a', name: 'Set A', user_id: 'user-1' },
      { id: 'set-b', name: 'Set B', user_id: 'user-1' },
      { id: 'set-c', name: 'Set C', user_id: 'user-1' },
    ];
    rowsByTable.set_words = [
      { set_id: 'set-a', word_sense_id: 'apple' },
      { set_id: 'set-b', word_sense_id: 'apple' },
      { set_id: 'set-c', word_sense_id: 'apple' },
    ];

    const { data, error } = await getUserVocabulary('user-1');
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data[0].set_names).toHaveLength(3);
  });

  it('Case F — user isolation: User B sở hữu cùng word_sense không lẫn vào Kho của User A', async () => {
    rowsByTable.user_vocabulary = [
      UV('user-1', 'apple'),
      UV('user-2', 'apple'),
    ];

    const { data, error } = await getUserVocabulary('user-1');
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data[0].word).toBe('apple');
  });

  it('Case G — re-import: sau khi ownership bị xóa (uv=0 → Kho=0), import lại tạo ownership mới → Kho=1', async () => {
    const { data: empty, error: err1 } = await getUserVocabulary('user-1');
    expect(err1).toBeNull();
    expect(empty).toEqual([]);

    // Re-import tạo ownership mới (row user_vocabulary mới).
    rowsByTable.user_vocabulary = [UV('user-1', 'apple')];
    const { data, error } = await getUserVocabulary('user-1');
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data[0].word).toBe('apple');
  });

  it('Case H — user-owned content WIN: memory_clue → memory_clue, example → example (KHÔNG map sang description)', async () => {
    rowsByTable.user_vocabulary = [
      UV('user-1', 'apple', { memory_clue: 'custom clue', example: 'custom example' }),
    ];

    const { data, error } = await getUserVocabulary('user-1');
    expect(error).toBeNull();
    expect(data[0].memory_clue).toBe('custom clue');
    expect(data[0].example).toBe('custom example');
  });

  it('Case H (fallback) — user-owned trống → fallback global word_senses, không crash', async () => {
    rowsByTable.user_vocabulary = [UV('user-1', 'apple')];

    const { data, error } = await getUserVocabulary('user-1');
    expect(error).toBeNull();
    expect(data[0].memory_clue).toBe('GLOBAL CLUE');
    expect(data[0].example).toBe('GLOBAL EXAMPLE');
  });
});

describe('DELETE A — removeWordCompletely ("Xóa khỏi kho")', () => {
  beforeEach(RESET);

  it('gọi RPC production remove_from_vocabulary(p_word_sense_id) — KHÔNG gọi unlink_word_from_set', async () => {
    rpcHandlers.remove_from_vocabulary = async () => ({
      data: [{ removed_ownership: 1, removed_progress: 1, removed_set_links: 3 }],
      error: null,
    });

    const { data, error } = await removeWordCompletely('user-1', 'sense-x');
    expect(error).toBeNull();
    expect(rpcCalls).toEqual([['remove_from_vocabulary', { p_word_sense_id: 'sense-x' }]]);
    expect(data[0].removed_set_links).toBe(3);
  });

  it('reject thiếu userId / wordSenseId mà không chạm DB', async () => {
    rpcHandlers.remove_from_vocabulary = async () => {
      throw new Error('RPC must not be called');
    };
    const { error: e1 } = await removeWordCompletely(null, 'sense-x');
    const { error: e2 } = await removeWordCompletely('user-1', null);
    expect(e1).toBeDefined();
    expect(e2).toBeDefined();
    expect(rpcCalls).toEqual([]);
    expect(deleteCalls).toEqual([]);
  });

  it('Case E — sau delete hoàn toàn: không còn ownership → Kho từ trống', async () => {
    rpcHandlers.remove_from_vocabulary = async () => ({ data: null, error: null });
    await removeWordCompletely('user-1', 'sense-x');

    rowsByTable.user_vocabulary = []; // ownership đã bị RPC xóa
    const { data, error } = await getUserVocabulary('user-1');
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});

describe('DELETE B — removeWordFromSet ("Xóa khỏi bộ từ")', () => {
  beforeEach(RESET);

  it('gọi RPC unlink_word_from_set(p_set_id, p_word_sense_id) — KHÔNG gọi remove_from_vocabulary', async () => {
    rpcHandlers.unlink_word_from_set = async () => ({ data: [{ removed_count: 1 }], error: null });

    const { data, error } = await removeWordFromSet({ setId: 'set-a', wordSenseId: 'apple' });
    expect(error).toBeNull();
    expect(rpcCalls).toEqual([['unlink_word_from_set', { p_set_id: 'set-a', p_word_sense_id: 'apple' }]]);
    expect(data[0].removed_count).toBe(1);
  });

  it('reject thiếu userId / setId / wordSenseId mà không chạm DB', async () => {
    rpcHandlers.unlink_word_from_set = async () => {
      throw new Error('RPC must not be called');
    };
    const { error: e1 } = await removeWordFromSet({});
    const { error: e2 } = await removeWordFromSet({ setId: 'set-a' });
    const { error: e3 } = await removeWordFromSet({ setId: 'set-a', wordSenseId: null });
    expect(e1).toBeDefined();
    expect(e2).toBeDefined();
    expect(e3).toBeDefined();
    expect(rpcCalls).toEqual([]);
    expect(deleteCalls).toEqual([]);
  });

  it('Case D — chỉ gỡ membership: từ vẫn còn ở Kho từ (user_vocabulary + progress giữ nguyên)', async () => {
    rpcHandlers.unlink_word_from_set = async () => ({ data: [{ removed_count: 1 }], error: null });
    await removeWordFromSet({ setId: 'set-a', wordSenseId: 'apple' });

    // Ownership KHÔNG bị xóa; chỉ set_words link của set-a bị RPC gỡ.
    rowsByTable.user_vocabulary = [UV('user-1', 'apple')];
    rowsByTable.vocabulary_sets = [{ id: 'set-b', name: 'Set B', user_id: 'user-1' }];
    rowsByTable.set_words = [{ set_id: 'set-b', word_sense_id: 'apple' }];

    const { data, error } = await getUserVocabulary('user-1');
    expect(error).toBeNull();
    expect(data).toHaveLength(1); // Kho từ vẫn có apple
    expect(data[0].set_names).toEqual(['Set B']); // chỉ còn membership Set B
  });

  it('không bao giờ delete trực tiếp từ frontend (chỉ RPC) — authorization server-side', async () => {
    rpcHandlers.unlink_word_from_set = async () => ({ data: [{ removed_count: 1 }], error: null });
    rpcHandlers.remove_from_vocabulary = async () => ({ data: null, error: null });
    await removeWordFromSet({ setId: 'set-a', wordSenseId: 'apple' });
    await removeWordCompletely('user-1', 'apple');
    expect(deleteCalls).toEqual([]);
  });
});


