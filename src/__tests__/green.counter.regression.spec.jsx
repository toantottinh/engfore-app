import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// ------------------------------------------------------------------
// REGRESSION SPEC — Vocabulary green (🟢 Mới) counter must decrement
// exactly once when a NEW word is introduced with ANY rating
// (AGAIN / HARD / GOOD / EASY), never -2, and never -1 for a word
// that is not in the green bucket. This drives the REAL hook + REAL
// StatusCounts pills (typing AND flashcard modes).
// ------------------------------------------------------------------

const TYPING = 2; // flashcard_reviews >= threshold -> typing mode

const getLearnSessionQueueMock = vi.fn();
const getDailyNewProgressMock = vi.fn(async () => ({ data: [], error: null }));
const getVocabularyStatsMock = vi.fn(async () => ({ data: { total_count: 2000, learning_count: 800 }, error: null }));
const recordResultMock = vi.fn(async ({ wordSenseId }) => ({
  progress: {
    user_id: 'user-1',
    word_sense_id: wordSenseId,
    mastery_level: 3,
    review_due_at: new Date(Date.now() + 600000).toISOString(),
    last_reviewed_at: new Date().toISOString(),
    repetitions: 1,
    interval_hours: 10,
    ease_factor: 2.5,
    lapses: 0,
    state: 'review',
    learning_step: 0,
  },
  error: null,
}));

vi.mock('../../tts.service.js', () => ({ ttsService: { isSupported: () => true, speak: vi.fn() } }));
vi.mock('../../../tts.service.js', () => ({ ttsService: { isSupported: () => true, speak: vi.fn() } }));
vi.mock('/home/asus/EngFore/tts.service.js', () => ({ ttsService: { isSupported: () => true, speak: vi.fn() } }));

vi.mock('../services/learning.service.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getLearnSessionQueue: (...args) => getLearnSessionQueueMock(...args),
    recordLearningResult: (...args) => recordResultMock(...args),
    getDailyNewProgress: getDailyNewProgressMock,
    getVocabularyStats: getVocabularyStatsMock,
    getUserDailyNewLimit: async () => ({ value: 20, error: null }),
  };
});
vi.mock('../../services/learning.service.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getLearnSessionQueue: (...args) => getLearnSessionQueueMock(...args),
    recordLearningResult: (...args) => recordResultMock(...args),
    getDailyNewProgress: getDailyNewProgressMock,
    getVocabularyStats: getVocabularyStatsMock,
    getUserDailyNewLimit: async () => ({ value: 20, error: null }),
  };
});
vi.mock('/home/asus/EngFore/src/services/learning.service.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getLearnSessionQueue: (...args) => getLearnSessionQueueMock(...args),
    recordLearningResult: (...args) => recordResultMock(...args),
    getDailyNewProgress: getDailyNewProgressMock,
    getVocabularyStats: getVocabularyStatsMock,
    getUserDailyNewLimit: async () => ({ value: 20, error: null }),
  };
});

vi.mock('../services/auth.service.js', () => ({
  authService: {
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    getSession: async () => ({ data: { session: null }, error: null }),
    ensureProfile: async () => ({ data: null, error: null }),
  },
}));
vi.mock('../../services/auth.service.js', () => ({
  authService: {
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    getSession: async () => ({ data: { session: null }, error: null }),
    ensureProfile: async () => ({ data: null, error: null }),
  },
}));

function makeWord(id, word, meaning, state, due) {
  return {
    id,
    word,
    meaning,
    state,
    review_due_at: due,
    set_id: 'set-1',
    flashcard_reviews: TYPING,
    mastery_level: 0,
    word_type: 'noun',
    ipa: '/t/',
    example: `Example ${word}`,
    memory_clue: `Clue ${word}`,
    cefr_level: 'A1',
  };
}

const PAST = new Date(Date.now() - 86400000).toISOString();
const NEW_WORD = makeWord('w1', 'apple', 'quả táo', 'new', null);
const REVIEW_WORD = makeWord('r1', 'orange', 'quả nâu', 'review', PAST);

async function mountSession(words) {
  cleanup();
  getLearnSessionQueueMock.mockResolvedValue({ queue: words, error: null });
  const { default: LearningSession } = await import('../pages/LearningSession/index.jsx');
  const { AuthProvider } = await import('../hooks/useAuth.jsx');
  render(
    <MemoryRouter initialEntries={['/learn/session/set-1']}>
      <AuthProvider initialUser={{ id: 'user-1', email: 'test@example.com' }}>
        <Routes>
          <Route path="/learn/session/:setId" element={<LearningSession />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
  await waitFor(() => expect(getLearnSessionQueueMock).toHaveBeenCalled());
}

function getCounts() {
  const val = (cls) => {
    const el = document.querySelector(cls);
    return el ? Number(el.textContent) : 0;
  };
  return {
    new: val('.status-pill--new strong'),
    again: val('.status-pill--again strong'),
    review: val('.status-pill--review strong'),
  };
}

async function typeAndReveal(input) {
  await userEvent.type(screen.getByPlaceholderText('Nhập từ tiếng Anh...'), input);
  await userEvent.click(screen.getByRole('button', { name: /Kiểm t/i }));
}

describe('LearningSession — flashcard-mode green (🟢 Mới) counter for a NEW word', () => {
  const FLASH_FRICTION = 0;

  function makeFlashWord(id, word, meaning) {
    return {
      id,
      word,
      meaning,
      state: 'new',
      review_due_at: null,
      set_id: 'set-1',
      flashcard_reviews: FLASH_FRICTION,
      mastery_level: 0,
      word_type: 'noun',
      ipa: '/t/',
      example: `Example ${word}`,
      memory_clue: `Clue ${word}`,
      cefr_level: 'A1',
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    getDailyNewProgressMock.mockImplementation(async () => ({ data: [], error: null }));
    getVocabularyStatsMock.mockImplementation(async () => ({ data: { total_count: 2000, learning_count: 800 }, error: null }));
  });
  afterEach(() => cleanup());

  const flipAndRate = async (ratingLabel) => {
    // Flip the flashcard to reveal the rating buttons.
    const card = screen.getByText('apple').closest('[role="button"]');
    await userEvent.click(card);
    await userEvent.click(screen.getByRole('button', { name: new RegExp(`^${ratingLabel}`) }));
  };

  it('F1. flashcard NEW + HARD: green decrements by exactly 1', async () => {
    await mountSession([makeFlashWord('wf1', 'apple', 'quả táo')]);
    await waitFor(() => screen.getByText('apple'));
    expect(getCounts()).toEqual({ new: 1, again: 0, review: 0 });

    await flipAndRate('Hard');
    await waitFor(() => getCounts().new === 0);
    expect(getCounts()).toEqual({ new: 0, again: 0, review: 0 });
  });

  it('F2. flashcard NEW + GOOD: green decrements by exactly 1', async () => {
    await mountSession([makeFlashWord('wf2', 'apple', 'quả táo')]);
    await waitFor(() => screen.getByText('apple'));
    expect(getCounts()).toEqual({ new: 1, again: 0, review: 0 });

    await flipAndRate('Good');
    await waitFor(() => getCounts().new === 0);
    expect(getCounts()).toEqual({ new: 0, again: 0, review: 0 });
  });

  it('F3. flashcard NEW + EASY: green decrements by exactly 1', async () => {
    await mountSession([makeFlashWord('wf3', 'apple', 'quả táo')]);
    await waitFor(() => screen.getByText('apple'));
    expect(getCounts()).toEqual({ new: 1, again: 0, review: 0 });

    await flipAndRate('Easy');
    await waitFor(() => getCounts().new === 0);
    expect(getCounts()).toEqual({ new: 0, again: 0, review: 0 });
  });

  it('F4. flashcard NEW + AGAIN: green drops once on the first Again (retry requeued)', async () => {
    await mountSession([makeFlashWord('wf4', 'apple', 'quả táo')]);
    await waitFor(() => screen.getByText('apple'));
    expect(getCounts()).toEqual({ new: 1, again: 0, review: 0 });

    // Flip + Again on the first flashcard pass → introduced → green -1 once.
    const card = screen.getByText('apple').closest('[role="button"]');
    await userEvent.click(card);
    await userEvent.click(screen.getByRole('button', { name: /^Again/ }));
    await waitFor(() => screen.findByRole('button', { name: /Tiếp t/i }));
    expect(getCounts()).toEqual({ new: 0, again: 0, review: 0 });

    // Continue to the requeued flashcard copy; flip + GOOD stays 0 (no -2).
    await userEvent.click(screen.getByRole('button', { name: /Tiếp t/i }));
    await waitFor(() => screen.getByText('apple'));
    const card2 = screen.getByText('apple').closest('[role="button"]');
    await userEvent.click(card2);
    await userEvent.click(screen.getByRole('button', { name: /^Good/ }));
    await waitFor(() => screen.findByRole('button', { name: /Tiếp t/i }));
    expect(getCounts()).toEqual({ new: 0, again: 0, review: 0 });
  }, 15000);
});

describe('LearningSession — 🟢 Mới counter for a NEW word across all ratings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDailyNewProgressMock.mockImplementation(async () => ({ data: [], error: null }));
    getVocabularyStatsMock.mockImplementation(async () => ({ data: { total_count: 2000, learning_count: 800 }, error: null }));
  });
  afterEach(() => cleanup());

  const rateAfterReveal = async (ratingLabel) => {
    await typeAndReveal('apple'); // correct answer, reveal rating buttons
    await userEvent.click(screen.getByRole('button', { name: new RegExp(`^${ratingLabel}`) }));
  };

  it('R1. NEW + AGAIN: 🟢 Mới decrements by exactly 1 (introduced)', async () => {
    await mountSession([NEW_WORD]);
    await waitFor(() => screen.getByText('quả táo'));
    expect(getCounts()).toEqual({ new: 1, again: 0, review: 0 });

    await typeAndReveal('wrong'); // wrong answer
    await userEvent.click(screen.getByRole('button', { name: /^Again/ }));
    // The requeue leaves a Continue button; green dropped exactly once.
    await waitFor(() => screen.findByRole('button', { name: /Tiếp t/i }));
    expect(getCounts()).toEqual({ new: 0, again: 0, review: 0 });
  });

  it('R2. NEW + HARD: 🟢 Mới decrements by exactly 1', async () => {
    await mountSession([NEW_WORD]);
    await waitFor(() => screen.getByText('quả táo'));
    expect(getCounts()).toEqual({ new: 1, again: 0, review: 0 });

    await rateAfterReveal('Hard');
    await waitFor(() => getCounts().new === 0);
    expect(getCounts()).toEqual({ new: 0, again: 0, review: 0 });
  });

  it('R3. NEW + GOOD: 🟢 Mới decrements by exactly 1', async () => {
    await mountSession([NEW_WORD]);
    await waitFor(() => screen.getByText('quả táo'));
    expect(getCounts()).toEqual({ new: 1, again: 0, review: 0 });

    await rateAfterReveal('Good');
    await waitFor(() => getCounts().new === 0);
    expect(getCounts()).toEqual({ new: 0, again: 0, review: 0 });
  });

  it('R4. NEW + EASY: 🟢 Mới decrements by exactly 1', async () => {
    await mountSession([NEW_WORD]);
    await waitFor(() => screen.getByText('quả táo'));
    expect(getCounts()).toEqual({ new: 1, again: 0, review: 0 });

    await rateAfterReveal('Easy');
    await waitFor(() => getCounts().new === 0);
    expect(getCounts()).toEqual({ new: 0, again: 0, review: 0 });
  });

  it('R5. The same word is never decremented twice (no -2)', async () => {
    await mountSession([NEW_WORD, REVIEW_WORD]);
    await waitFor(() => screen.getByText('quả táo'));
    expect(getCounts()).toEqual({ new: 1, again: 0, review: 1 });

    // Complete the NEW word with GOOD -> green -1.
    await typeAndReveal('apple');
    await userEvent.click(screen.getByRole('button', { name: /^Good/ }));
    await waitFor(() => getCounts().new === 0);
    expect(getCounts()).toEqual({ new: 0, again: 0, review: 1 });

    // Continue to the review word.
    await userEvent.click(screen.getByRole('button', { name: /Tiếp t/i }));
    await waitFor(() => screen.getByText('quả nâu'));

    // Rating the REVIEW word must NOT touch the green count, and must not
    // decrement the NEW word again (it no longer exists in the counters).
    await typeAndReveal('orange');
    await userEvent.click(screen.getByRole('button', { name: /^Good/ }));
    await waitFor(() => getCounts().review === 0);
    expect(getCounts()).toEqual({ new: 0, again: 0, review: 0 });
  });

  it('R6. Non-green (REVIEW) words rated Good never touch the green count', async () => {
    await mountSession([REVIEW_WORD]);
    await waitFor(() => screen.getByText('quả nâu'));
    expect(getCounts()).toEqual({ new: 0, again: 0, review: 1 });

    await typeAndReveal('orange');
    await userEvent.click(screen.getByRole('button', { name: /^Good/ }));
    await waitFor(() => getCounts().review === 0);
    expect(getCounts()).toEqual({ new: 0, again: 0, review: 0 });
  });
});