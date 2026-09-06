import { describe, expect, it, vi } from 'vitest';

const { fromMock, priorityError } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  priorityError: new Error('priority request failed'),
}));

const makeBuilder = (table) => {
  const builder = {
    insert: vi.fn(() => builder),
    select: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => ({
      data: table === 'vocabulary_sets' ? { id: 'set-b' } : null,
      error: null,
    })),
    upsert: vi.fn(() => ({
      then(_onFulfilled, onRejected) {
        return Promise.reject(priorityError).then(undefined, onRejected);
      },
    })),
  };
  return builder;
};

fromMock.mockImplementation((table) => makeBuilder(table));

vi.mock('../services/supabase.js', () => ({
  supabase: { from: fromMock },
}));

import { createVocabularySet } from '../services/vocabulary.service.js';

describe('createVocabularySet', () => {
  it('keeps the created set when optional priority persistence rejects', async () => {
    const result = await createVocabularySet({
      name: 'Set B',
      description: null,
      userId: 'user-1',
    });

    expect(result.error).toBeNull();
    expect(result.data).toEqual({ id: 'set-b' });
    expect(fromMock).toHaveBeenCalledWith('user_set_learn_priority');
  });
});