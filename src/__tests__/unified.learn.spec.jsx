import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '../hooks/useAuth.jsx';
import LearningSession from '../pages/LearningSession/index.jsx';

// ------------------------------------------------------------------
// Mocks — correct boundary.
//
// After the Unified Learn refactor, useLearningSession no longer calls
// the old getWordsInSet / getUserSetLearnPriorities abstraction. It now
// calls getLearnSessionQueue (the Unified Learn Engine) plus the daily
// NEW-quota helpers. Mocking THAT boundary keeps the fake authenticated
// user (id = "user-1") away from every Supabase UUID parameter, while
// still exercising the real component rendering / rating / keyboard flow.
// ------------------------------------------------------------------
let mockQueue = []; // the session queue getLearnSessionQueue returns
let mockDailyProgress = []; // word_sense_ids already introduced today
let mockDailyLimit = 20;
let mockVocabStats = { total_count: 2000, learning_count: 800 }; // RPC get_user_vocabulary_stats

const getLearnSessionQueueMock = vi.fn();
const getDailyNewProgressMock = vi.fn(async () => ({ data: mockDailyProgress, error: null }));
const getUserDailyNewLimitMock = vi.fn(async () => ({ value: mockDailyLimit, error: null }));
const markDailyNewIntroducedMock = vi.fn(async () => ({ error: null }));
const getVocabularyStatsMock = vi.fn(async () => ({ data: mockVocabStats, error: null }));
const recordProgressMock = vi.fn().mockResolvedValue({ progress: {}, error: null });

vi.mock('../services/learning.service.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getLearnSessionQueue: (...args) => getLearnSessionQueueMock(...args),
    getUserDailyNewLimit: (...args) => getUserDailyNewLimitMock(...args),
    getDailyNewProgress: (...args) => getDailyNewProgressMock(...args),
    markDailyNewIntroduced: (...args) => markDailyNewIntroducedMock(...args),
    getVocabularyStats: (...args) => getVocabularyStatsMock(...args),
  };
});

// useLearning provides recordProgress to the hook.
vi.mock('../hooks/useLearning.js', () => ({
  useLearning: () => ({ recordProgress: recordProgressMock }),
}));

// Keep AuthProvider from touching real Supabase (ensureProfile, auth events).
vi.mock('../services/auth.service.js', () => ({
  authService: {
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    getSession: async () => ({ data: { session: null }, error: null }),
    ensureProfile: async () => ({ data: null, error: null }),
  },
}));

// The session page re-exports TTS from the project-root entry point.
vi.mock('../../tts.service.js', () => ({
  ttsService: { speak: vi.fn() },
}));

const makeWord = (id, word, state, review_due_at, set_id = 'set1') => ({
  id,
  word,
  meaning: `meaning for ${word}`,
  state,
  review_due_at,
  set_id,
  flashcard_reviews: 2, // force typing mode
});

const YESTERDAY = new Date(Date.now() - 86400000).toISOString();
const TOMORROW = new Date(Date.now() + 86400000).toISOString();

async function mountSession(initialUser = { id: 'user-1' }) {
  cleanup();
  getLearnSessionQueueMock.mockImplementation(async () => ({ queue: mockQueue, error: null }));
  render(
    <MemoryRouter initialEntries={['/learn/session/all']}>
      <AuthProvider initialUser={initialUser}>
        <Routes>
          <Route path="/learn/session/:setId" element={<LearningSession />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
  await waitFor(() => expect(getLearnSessionQueueMock).toHaveBeenCalled());
}


describe('Unified Learn Engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQueue = [];
    mockDailyProgress = [];
    mockDailyLimit = 3;
  });

  it('Queue Order: shows DUE > LEARNING > NEW', async () => {
    mockQueue = [
      makeWord('d1', 'due 1', 'review', YESTERDAY),
      makeWord('l1', 'learning 1', 'learning', TOMORROW),
      makeWord('n1', 'new 1', 'new', null),
    ];

    await mountSession();

    await screen.findByText('meaning for due 1');
    await userEvent.type(screen.getByRole('textbox'), 'due 1');
    await userEvent.click(screen.getByText('Kiểm tra'));
    await userEvent.click(await screen.findByText(/Good/));
    await userEvent.click(await screen.findByText(/Tiếp tục/));

    await screen.findByText('meaning for learning 1');
    await userEvent.type(screen.getByRole('textbox'), 'learning 1');
    await userEvent.click(screen.getByText('Kiểm tra'));
    await userEvent.click(await screen.findByText(/Good/));
    await userEvent.click(await screen.findByText(/Tiếp tục/));

    await screen.findByText('meaning for new 1');
  });

  it('Handles DUE=0, NEW > 0 correctly', async () => {
    mockQueue = [makeWord('n1', 'new word', 'new', null)];
    await mountSession();
    await screen.findByText('meaning for new word');
    expect(screen.getByText('🆕 Từ mới')).toBeInTheDocument();
  });

  it('LIMITED mode: respects daily new limit', async () => {
    mockDailyLimit = 1;
    // The engine caps NEW by (dailyNewLimit - introducedTodayCount), so the
    // queue returned to the UI already contains only ONE new word (n1).
    mockQueue = [
      makeWord('d1', 'due 1', 'review', YESTERDAY),
      makeWord('n1', 'new 1', 'new', null),
    ];

    await mountSession();
    await userEvent.click(screen.getByText('Theo giới hạn')); // ensure LIMITED mode

    // Due word first, then exactly one new word, then the session is complete.
    await screen.findByText('meaning for due 1');
    await userEvent.type(screen.getByRole('textbox'), 'due 1');
    await userEvent.click(screen.getByText('Kiểm tra'));
    await userEvent.click(await screen.findByText(/Good/));
    await userEvent.click(await screen.findByText(/Tiếp tục/));

    await screen.findByText('meaning for new 1');
    await userEvent.type(screen.getByRole('textbox'), 'new 1');
    await userEvent.click(screen.getByText('Kiểm tra'));
    await userEvent.click(await screen.findByText(/Good/));
    await userEvent.click(await screen.findByText(/Tiếp tục/));

    await screen.findByText('Hoàn thành phiên học!');

    // The engine received the LIMITED quota it used to pick only one NEW word.
    expect(getLearnSessionQueueMock).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ learnMode: 'LIMITED', dailyNewLimit: 1 })
    );
  });

  it('UNLIMITED mode: ignores daily new limit', async () => {
    mockDailyLimit = 1;
    mockDailyProgress = [{ word_sense_id: 'introduced-yesterday' }]; // Already met limit
    mockQueue = [makeWord('n1', 'new 1', 'new', null), makeWord('n2', 'new 2', 'new', null)];

    await mountSession();
    await userEvent.click(screen.getByText('Không giới hạn'));

    await waitFor(() => expect(screen.getByText('meaning for new 1')).toBeInTheDocument());

    // UNLIMITED switches the engine off the daily cap.
    expect(getLearnSessionQueueMock).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ learnMode: 'UNLIMITED' })
    );
  });

  it('Queue Order: when setId is "all", fetches from all sets and respects set priority for NEW words', async () => {
    // "all" is normalized by the engine into an all-user scope (null set filter).
    // The queue returned here is the engine's final order:
    //   DUE (set-A) -> LEARNING (set-B) -> NEW by set priority
    //   (set-A prio 1, set-B prio 2, set-C prio 3).
    mockQueue = [
      makeWord('d1', 'due 1 (set-A)', 'review', YESTERDAY, 'set-A'),
      makeWord('l1', 'learning 1 (set-B)', 'learning', TOMORROW, 'set-B'),
      makeWord('n2', 'new 2 (set-A)', 'new', null, 'set-A'),
      makeWord('n1', 'new 1 (set-B)', 'new', null, 'set-B'),
      makeWord('n3', 'new 3 (set-C)', 'new', null, 'set-C'),
    ];

    await mountSession(); // Route /learn/session/all -> setId "all"

    // Due word first
    await screen.findByText('meaning for due 1 (set-A)');
    await userEvent.type(screen.getByRole('textbox'), 'due 1 (set-A)'); await userEvent.click(screen.getByText('Kiểm tra')); await userEvent.click(await screen.findByText(/Good/)); await userEvent.click(await screen.findByText(/Tiếp tục/));

    // Learning word next
    await screen.findByText('meaning for learning 1 (set-B)');
    await userEvent.type(screen.getByRole('textbox'), 'learning 1 (set-B)'); await userEvent.click(screen.getByText('Kiểm tra')); await userEvent.click(await screen.findByText(/Good/)); await userEvent.click(await screen.findByText(/Tiếp tục/));

    // New words by priority: set-A (prio 1), then set-B (prio 2), then set-C (prio 3)
    await screen.findByText('meaning for new 2 (set-A)');
    await userEvent.type(screen.getByRole('textbox'), 'new 2 (set-A)'); await userEvent.click(screen.getByText('Kiểm tra')); await userEvent.click(await screen.findByText(/Good/)); await userEvent.click(await screen.findByText(/Tiếp tục/));

    await screen.findByText('meaning for new 1 (set-B)');
    await userEvent.type(screen.getByRole('textbox'), 'new 1 (set-B)'); await userEvent.click(screen.getByText('Kiểm tra')); await userEvent.click(await screen.findByText(/Good/)); await userEvent.click(await screen.findByText(/Tiếp tục/));

    await screen.findByText('meaning for new 3 (set-C)');

    // The "all" scope is passed to the engine as-is (never sent to a UUID RPC).
    expect(getLearnSessionQueueMock).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ setId: 'all' })
    );
  });

  it('Vocabulary stats: renders Tổng cộng / Đang học / Từ mới from DB and refreshes after rating a NEW word', async () => {
    // RPC get_user_vocabulary_stats: total_count = learning_count + new
    mockVocabStats = { total_count: 2000, learning_count: 800 }; // → Từ mới = 1.200
    mockQueue = [makeWord('n1', 'stat 1', 'new', null)];

    await mountSession();

    // Stats card renders real DB values (VN formatting).
    await screen.findByText('Vốn từ của bạn');
    expect(screen.getByText('2.000')).toBeInTheDocument();
    expect(screen.getByText('800')).toBeInTheDocument();
    expect(screen.getByText('1.200')).toBeInTheDocument();

    const callsBefore = getVocabularyStatsMock.mock.calls.length;

    // Rate the NEW word (makeWord sets flashcard_reviews: 2 → typing mode).
    await userEvent.type(screen.getByPlaceholderText('Nhập từ tiếng Anh...'), 'stat 1');
    await userEvent.click(screen.getByText('Kiểm tra'));
    await userEvent.click(await screen.findByText(/Good/));

    // After a NEW word is learned, stats are re-fetched from the DB
    // (so Đang học +1 and Từ mới -1 reflect the write to user_progress).
    await waitFor(() =>
      expect(getVocabularyStatsMock.mock.calls.length).toBeGreaterThan(callsBefore)
    );
  });
});
