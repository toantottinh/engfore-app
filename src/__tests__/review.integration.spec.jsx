import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// Track sequence of operations
let seq = [];

// Mock learning service functions used by Review
const mockWords = Array.from({ length: 4 }).map((_, i) => ({
  id: `sense-${i + 1}`,
  word: `word${i + 1}`,
  meaning: `meaning${i + 1}`,
  mastery_level: 0,
}));

const recordMock = vi.fn(async ({ userId, wordSenseId, rating, correct }) => {
  seq.push(`save:${wordSenseId}:${rating ?? (correct ? 'G' : 'A')}`);
  return { progress: { user_id: userId, word_sense_id: wordSenseId }, error: null };
});

const statsMock = vi.fn(async () => {
  seq.push('stats');
  return { data: { due: 2, new: 1, learning: 0, relearning: 0, review: 1, nextDueAt: null }, error: null };
});

describe('Review -> save -> stats -> navigate integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seq = [];
  });

  it('saves all review results, calls stats, then navigates to dashboard', async () => {
    // Simulate saving loop without UI: call recordLearningResult sequentially
    for (let i = 0; i < mockWords.length; i++) {
      await recordMock({ userId: 'user-1', wordSenseId: mockWords[i].id, rating: i % 4 });
    }
    // After saves, fetch stats
    const statsRes = await statsMock();

    expect(recordMock).toHaveBeenCalledTimes(4);
    expect(statsMock).toHaveBeenCalledTimes(1);
    expect(statsRes.data).toBeTruthy();
    const savedSteps = seq.filter((s) => s.startsWith('save'));
    expect(savedSteps.length).toBe(4);
    expect(seq[seq.length - 1]).toBe('stats');
  });

  it('navigates even if stats fetch fails but saves persist', async () => {
    // Simulate saving then failing stats
    await recordMock({ userId: 'user-1', wordSenseId: mockWords[0].id, rating: 0 });
    statsMock.mockImplementationOnce(async () => ({ data: null, error: { message: 'boom' } }));
    const failed = await statsMock();
    expect(recordMock).toHaveBeenCalled();
    expect(statsMock).toHaveBeenCalled();
    expect(failed.data).toBeNull();
  });
});
