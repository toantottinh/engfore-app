import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import React from 'react';

// =====================================================================
// Hook-level tests: selection state + bulk delete + service contract.
// Real hook + REAL removeWordsFromSet / removeWordFromSet / updateUserWord
// đi qua supabase mock → assert RPC contract (unlink_words_from_set /
// unlink_word_from_set / update_user_word).
// =====================================================================

const rpcCalls = [];
const rpcHandler = {};

const fromChain = () => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: async () => ({ data: { id: 'set-a', name: 'Set A', user_id: 'user-1' }, error: null }),
    then: (res) => Promise.resolve({ data: [], error: null }).then(res),
  };
  return chain;
};

vi.mock('../services/supabase.js', () => ({
  supabase: {
    from: () => fromChain(),
    rpc: async (fn, args) => {
      rpcCalls.push([fn, args]);
      const h = rpcHandler[fn];
      return h ? await h(args) : { data: null, error: null };
    },
  },
}));

vi.mock('../hooks/useAuth.jsx', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

// Partial mock: chỉ mock các read/write phụ trợ; bulk/unlink/update giữ REAL
// để contract test chạy thật qua supabase mock.
vi.mock('../services/vocabulary.service.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getVocabularySet: vi.fn(async () => ({ data: { id: 'set-a', name: 'Set A', user_id: 'user-1' }, error: null })),
    getWordsInSet: vi.fn(async () => ({ data: [], error: null })),
    addWordToSet: vi.fn(async () => ({ error: null })),
    updateVocabularySet: vi.fn(async () => ({ error: null })),
  };
});

import { useVocabularyDetail } from '../hooks/useVocabularyDetail.js';
import {
  removeWordsFromSet,
  removeWordFromSet,
  updateUserVocabularyWord,
} from '../services/vocabulary.service.js';

let exposed = null;
function Harness({ setId }) {
  exposed = useVocabularyDetail(setId);
  return null;
}

describe('useVocabularyDetail — selection state', () => {
  beforeEach(() => {
    rpcCalls.length = 0;
    delete rpcHandler.unlink_words_from_set;
  });

  it('toggle một từ → selection cập nhật; toggle lại → bỏ chọn', async () => {
    const { rerender } = render(<Harness setId="set-a" />);
    await act(async () => {});
    expect(exposed.selectedWordSenseIds).toEqual([]);

    await act(async () => { exposed.toggleWordSelection('w1'); });
    await act(async () => { exposed.toggleWordSelection('w2'); });
    expect(exposed.selectedWordSenseIds).toEqual(['w1', 'w2']);

    await act(async () => { exposed.toggleWordSelection('w1'); });
    expect(exposed.selectedWordSenseIds).toEqual(['w2']);
    rerender(<Harness setId="set-a" />);
  });

  it('selectAllWords đặt full list; clearSelection reset', async () => {
    render(<Harness setId="set-a" />);
    await act(async () => {});

    await act(async () => { exposed.selectAllWords(['w1', 'w2', 'w3']); });
    expect(exposed.selectedWordSenseIds).toEqual(['w1', 'w2', 'w3']);

    await act(async () => { exposed.clearSelection(); });
    expect(exposed.selectedWordSenseIds).toEqual([]);
  });

  it('selection reset khi đổi Set (setId thay đổi) — tránh xóa nhầm set khác', async () => {
    const { rerender } = render(<Harness setId="set-a" />);
    await act(async () => {});
    await act(async () => { exposed.selectAllWords(['w1', 'w2']); });
    expect(exposed.selectedWordSenseIds).toEqual(['w1', 'w2']);

    await act(async () => { rerender(<Harness setId="set-b" />); });
    expect(exposed.selectedWordSenseIds).toEqual([]);
  });
});

describe('useVocabularyDetail — bulk removeSelectedWords', () => {
  beforeEach(() => {
    rpcCalls.length = 0;
    delete rpcHandler.unlink_words_from_set;
  });

  it('thành công → gọi RPC unlink_words_from_set đúng args + clear selection', async () => {
    const { rerender } = render(<Harness setId="set-a" />);
    await act(async () => {});
    await act(async () => { exposed.selectAllWords(['w1', 'w2']); });

    let result;
    await act(async () => { result = await exposed.removeSelectedWords(['w1', 'w2']); });

    expect(result.error).toBeNull();
    expect(rpcCalls).toContainEqual([
      'unlink_words_from_set',
      { p_set_id: 'set-a', p_word_sense_ids: ['w1', 'w2'] },
    ]);
    expect(exposed.selectedWordSenseIds).toEqual([]); // clear sau khi xóa thành công
    rerender(<Harness setId="set-a" />);
  });

  it('lỗi RPC → GIỮ selection, trả error', async () => {
    rpcHandler.unlink_words_from_set = async () => ({
      data: null,
      error: { message: 'Bạn không có quyền xóa từ khỏi bộ từ này.' },
    });
    render(<Harness setId="set-a" />);
    await act(async () => {});
    await act(async () => { exposed.selectAllWords(['w1', 'w2']); });

    let result;
    await act(async () => { result = await exposed.removeSelectedWords(['w1', 'w2']); });

    expect(result.error).toBeDefined();
    expect(exposed.selectedWordSenseIds).toEqual(['w1', 'w2']); // giữ nguyên selection
  });
});

describe('service contract — bulk / single unlink + update_user_word', () => {
  beforeEach(() => {
    rpcCalls.length = 0;
    delete rpcHandler.unlink_words_from_set;
  });

  it('removeWordsFromSet → RPC unlink_words_from_set(p_set_id, p_word_sense_ids) — không truyền userId', async () => {
    const { data, error } = await removeWordsFromSet({ setId: 'set-a', wordSenseIds: ['w1', 'w2'] });
    expect(error).toBeNull();
    expect(rpcCalls).toEqual([
      ['unlink_words_from_set', { p_set_id: 'set-a', p_word_sense_ids: ['w1', 'w2'] }],
    ]);
    expect(data).toBeNull();
  });

  it('removeWordsFromSet reject thiếu setId / ids mà không chạm DB', async () => {
    expect((await removeWordsFromSet({})).error).toBeDefined();
    expect((await removeWordsFromSet({ setId: 'set-a' })).error).toBeDefined();
    expect((await removeWordsFromSet({ setId: 'set-a', wordSenseIds: [] })).error).toBeDefined();
    expect(rpcCalls).toEqual([]);
  });

  it('removeWordFromSet → RPC unlink_word_from_set (single-word API giữ nguyên)', async () => {
    await removeWordFromSet({ setId: 'set-a', wordSenseId: 'w1' });
    expect(rpcCalls).toEqual([
      ['unlink_word_from_set', { p_set_id: 'set-a', p_word_sense_id: 'w1' }],
    ]);
  });

  it('updateUserVocabularyWord → RPC update_user_word_content (user-owned content only)', async () => {
    const { error } = await updateUserVocabularyWord({
      wordSenseId: 'w1',
      example: 'You can allow them.',
      memoryClue: 'a-lâu',
    });
    expect(error).toBeNull();
    expect(rpcCalls).toEqual([
      [
        'update_user_word_content',
        {
          p_word_sense_id: 'w1',
          p_example: 'You can allow them.',
          p_memory_clue: 'a-lâu',
        },
      ],
    ]);
  });

  it('updateUserVocabularyWord: chuỗi trống → null; thiếu wordSenseId → reject không chạm DB', async () => {
    await updateUserVocabularyWord({ wordSenseId: 'w2', example: '   ', memoryClue: '' });
    expect(rpcCalls).toEqual([
      ['update_user_word_content', { p_word_sense_id: 'w2', p_example: null, p_memory_clue: null }],
    ]);

    rpcCalls.length = 0;
    expect((await updateUserVocabularyWord({ example: 'x' })).error).toBeDefined();
    expect(rpcCalls).toEqual([]);
  });
});


