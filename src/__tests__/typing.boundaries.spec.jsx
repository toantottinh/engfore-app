import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// Mocks for learning.service
let recorded = [];

const recordLearningResultMock = vi.fn(
  async ({ userId, wordSenseId, rating }) => {
    recorded.push({ userId, wordSenseId, rating });

    return {
      progress: {
        user_id: userId,
        word_sense_id: wordSenseId,
        review_count: 3,
      },
      error: null,
    };
  }
);

const getDueReviewWordsMock = vi.fn(async () => ({
  data: [
    {
      id: 'w-typing',
      word: 'apple',
      meaning: 'quả táo',
      mastery_level: 2,
      review_count: 2,
    },
  ],
  error: null,
}));

const getDueReviewWordsCountMock = vi.fn(async () => ({
  count: 1,
  error: null,
}));

const getSrsDashboardStatsMock = vi.fn(async () => ({
  data: {
    due: 0,
    new: 0,
    review: 1,
  },
  error: null,
}));

function learningFactory() {
  return {
    getDueReviewWords: (...args) => getDueReviewWordsMock(...args),
    getDueReviewWordsCount: (...args) =>
      getDueReviewWordsCountMock(...args),
    recordLearningResult: (...args) =>
      recordLearningResultMock(...args),
    getSrsDashboardStats: (...args) =>
      getSrsDashboardStatsMock(...args),
  };
}

vi.mock('../services/learning.service.js', learningFactory);
vi.mock('../../services/learning.service.js', learningFactory);
vi.mock(
  '/home/asus/EngFore/src/services/learning.service.js',
  learningFactory
);

// Mock auth service
vi.mock('../services/auth.service.js', () => ({
  authService: {
    onAuthStateChange: () => ({
      data: {
        subscription: {
          unsubscribe: () => {},
        },
      },
    }),
    getSession: async () => ({
      data: {
        session: null,
      },
      error: null,
    }),
    ensureProfile: async () => ({
      data: null,
      error: null,
    }),
  },
}));

describe('Typing boundaries in Review TypingCard', () => {
  beforeEach(() => {
    recorded = [];

    vi.clearAllMocks();
    vi.useRealTimers();

    cleanup();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  async function mountReviewWithNow(now, { fakeTimers = false } = {}) {
    if (fakeTimers) {
      vi.useFakeTimers();
      vi.setSystemTime(now);
    } else {
      vi.spyOn(Date, 'now').mockReturnValue(now);
    }

    const { default: Review } = await import('../pages/Review/index.jsx');
    const { AuthProvider } = await import('../hooks/useAuth.jsx');

    const user = userEvent.setup(
      fakeTimers
        ? {
            advanceTimers: vi.advanceTimersByTime,
          }
        : undefined
    );

    render(
      <MemoryRouter initialEntries={['/review']}>
        <AuthProvider initialSession={{ user: { id: 'user-1' } }}>
          <Routes>
            <Route path="/review" element={<Review />} />
            <Route path="/app" element={<div>Dashboard</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() =>
      expect(getDueReviewWordsMock).toHaveBeenCalled()
    );

    await screen.findByText('Ôn tập');

    // IMPORTANT:
    // Date.now must remain controlled while the Review intro
    // transitions into the actual TypingCard.
    const startBtn = await screen.findByRole('button', {
      name: /Bắt đầu ôn tập/i,
    });

    await user.click(startBtn);

    await screen.findByPlaceholderText('Nhập từ tiếng Anh...');

    return { user };
  }

  it('correct under 15s -> EASY', async () => {
    const base = 1_000_000;

    const { user } = await mountReviewWithNow(base);

    vi.spyOn(Date, 'now').mockReturnValue(base + 10_000);

    const input = screen.getByPlaceholderText(
      'Nhập từ tiếng Anh...'
    );

    await user.type(input, 'apple');

    const submit = screen.getByRole('button', {
      name: /Kiểm tra/i,
    });

    await user.click(submit);

    const nextBtn = await screen.findByRole('button', {
      name: /Từ tiếp theo/i,
    });

    await user.click(nextBtn);

    await waitFor(() =>
      expect(recordLearningResultMock).toHaveBeenCalled()
    );

    expect(recorded[0].rating).toBe(4);
  });

  it('correct 15-30s -> GOOD', async () => {
    const base = 2_000_000;

    const { user } = await mountReviewWithNow(base);

    vi.spyOn(Date, 'now').mockReturnValue(base + 16_000);

    const input = screen.getByPlaceholderText(
      'Nhập từ tiếng Anh...'
    );

    await user.type(input, 'apple');

    expect(input).toHaveValue('apple');

    const submit = screen.getByRole('button', {
      name: /Kiểm tra/i,
    });

    await user.click(submit);

    expect(
      screen.getByText('Chính xác!')
    ).toBeInTheDocument();

    const nextBtn = await screen.findByRole('button', {
      name: /Từ tiếp theo/i,
    });

    await user.click(nextBtn);

    await waitFor(() =>
      expect(recordLearningResultMock).toHaveBeenCalled()
    );

    expect(recorded[0].rating).toBe(3);
  });

  it('correct 30-45s -> HARD', async () => {
    const base = 3_000_000;

    const { user } = await mountReviewWithNow(base);

    vi.spyOn(Date, 'now').mockReturnValue(base + 31_000);

    const input = screen.getByPlaceholderText(
      'Nhập từ tiếng Anh...'
    );

    await user.type(input, 'apple');

    const submit = screen.getByRole('button', {
      name: /Kiểm tra/i,
    });

    await user.click(submit);

    const nextBtn = await screen.findByRole('button', {
      name: /Từ tiếp theo/i,
    });

    await user.click(nextBtn);

    await waitFor(() =>
      expect(recordLearningResultMock).toHaveBeenCalled()
    );

    expect(recorded[0].rating).toBe(2);
  });

  it('correct 45-60s -> AGAIN', async () => {
    const base = 4_000_000;

    const { user } = await mountReviewWithNow(base);

    vi.spyOn(Date, 'now').mockReturnValue(base + 46_000);

    const input = screen.getByPlaceholderText(
      'Nhập từ tiếng Anh...'
    );

    await user.type(input, 'apple');

    const submit = screen.getByRole('button', {
      name: /Kiểm tra/i,
    });

    await user.click(submit);

    const nextBtn = await screen.findByRole('button', {
      name: /Từ tiếp theo/i,
    });

    await user.click(nextBtn);

    await waitFor(() =>
      expect(recordLearningResultMock).toHaveBeenCalled()
    );

    expect(recorded[0].rating).toBe(0);
  });

  it('incorrect -> AGAIN', async () => {
    const base = 5_000_000;

    const { user } = await mountReviewWithNow(base);

    vi.spyOn(Date, 'now').mockReturnValue(base + 2_000);

    const input = screen.getByPlaceholderText(
      'Nhập từ tiếng Anh...'
    );

    await user.type(input, 'wrong');

    const submit = screen.getByRole('button', {
      name: /Kiểm tra/i,
    });

    await user.click(submit);

    expect(
      screen.getByText(/Chưa chính xác/i)
    ).toBeInTheDocument();

    const nextBtn = await screen.findByRole('button', {
      name: /Từ tiếp theo/i,
    });

    await user.click(nextBtn);

    await waitFor(() =>
      expect(recordLearningResultMock).toHaveBeenCalled()
    );

    expect(recorded[0].rating).toBe(0);
  });

  it('timeout -> AGAIN', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(6_000_000);

  const { TypingCard } = await import('../pages/Review/index.jsx');

  const onResult = vi.fn();
  const onNext = vi.fn();

  render(
    <TypingCard
      word={{
        id: 'w-typing',
        word: 'apple',
        meaning: 'quả táo',
        mastery_level: 2,
        review_count: 2,
      }}
      onResult={onResult}
      onNext={onNext}
    />
  );

  expect(
    screen.getByPlaceholderText('Nhập từ tiếng Anh...')
  ).toBeInTheDocument();

  act(() => {
    vi.advanceTimersByTime(60_000);
  });

  expect(
    screen.getByText(/Đáp án đúng: apple/i)
  ).toBeInTheDocument();

  expect(onResult).toHaveBeenCalledWith(
    'w-typing',
    0
  );
});
});