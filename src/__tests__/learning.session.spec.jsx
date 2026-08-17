import React from 'react';
import	 { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { DEFAULT_DAILY_NEW_LIMIT } from '../services/quota.service.js';

// ---------------------------------------------------------------
// Test Data
// ---------------------------------------------------------------
const TYPING = 2; // flashcard_reviews >= FLASHCARD_REVIEWS_THRESHOLD -> typing mode
const FLASH = 0; //  flashcard_reviews below threshold              -> flashcard mode

function makeWord(id, word, meaning, reviews) {
  return {
    id,
    word,
    meaning,
    state: 'new',
    flashcard_reviews: reviews,
    mastery_level: 0,
    word_type: 'noun',
    ipa: '/test/',
    example: 'Example for ' + word,
    memory_clue: 'Clue for ' + word,
    cefr_level: 'A1',
  };
}

const W_TYPING = [
  makeWord('w1', 'apple', 'quả táo', TYPING),
  makeWord('w2', 'banana', 'quả chuối', TYPING),
  makeWord('w3', 'cherry', 'quả anh đào', TYPING),
];

const W_FLASH = [
  makeWord('w1', 'apple', 'quả táo', FLASH),
  makeWord('w2', 'banana', 'quả chuối', FLASH),
  makeWord('w3', 'cherry', 'quả anh đào', FLASH),
];

const phraseWord = makeWord('wp', 'have breakfast', 'ăn sáng', TYPING);

// ---------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------
const speakMock = vi.fn(async () => {});
const recordResultMock = vi.fn();
const getLearnSessionQueueMock = vi.fn(); // The new primary mock for this test
const getDailyNewProgressMock = vi.fn(async () => ({ data: [], error: null }));
const getVocabularyStatsMock = vi.fn(async () => ({ data: { total_count: 2000, learning_count: 800 }, error: null }));

vi.mock('../../tts.service.js', () => ({
  ttsService: { isSupported: () => true, speak: (...args) => speakMock(...args) },
}));
vi.mock('../../../tts.service.js', () => ({
  ttsService: { isSupported: () => true, speak: (...args) => speakMock(...args) },
}));
vi.mock('/home/asus/EngFore/tts.service.js', () => ({
  ttsService: { isSupported: () => true, speak: (...args) => speakMock(...args) },
}));

const okProgress = (userId, wordSenseId) => ({
  user_id: userId,
  word_sense_id: wordSenseId,
  mastery_level: 3,
  review_due_at: new Date(Date.now() + 600 * 1000).toISOString(),
  last_reviewed_at: new Date().toISOString(),
  repetitions: 1,
  interval_hours: 10,
  ease_factor: 2.5,
  lapses: 0,
  state: 'review',
  learning_step: 0,
});

// Mock the entire learning service, but override getLearnSessionQueue
vi.mock('../services/learning.service.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getLearnSessionQueue: (...args) => getLearnSessionQueueMock(...args),
    recordLearningResult: (...args) => recordResultMock(...args),
    getDailyNewProgress: getDailyNewProgressMock,
    getVocabularyStats: getVocabularyStatsMock,
    getUserDailyNewLimit: async () => ({ value: DEFAULT_DAILY_NEW_LIMIT, error: null }),
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
    getUserDailyNewLimit: async () => ({ value: DEFAULT_DAILY_NEW_LIMIT, error: null }),
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
    getUserDailyNewLimit: async () => ({ value: DEFAULT_DAILY_NEW_LIMIT, error: null }),
  };
});


// This mock is now only needed for getVocabularySet
vi.mock('../services/vocabulary.service.js', () => ({
  getVocabularySet: async () => ({ data: { id: 'set-1', name: 'Test Set' }, error: null }),
}));
vi.mock('../../services/vocabulary.service.js', () => ({
  getVocabularySet: async () => ({ data: { id: 'set-1', name: 'Test Set' }, error: null }),
}));
vi.mock('/home/asus/EngFore/src/services/vocabulary.service.js', () => ({
    getVocabularySet: async () => ({ data: { id: 'set-1', name: 'Test Set' }, error: null }),
}));


// Mock auth service (same as other specs)
vi.mock('../services/auth.service.js', () => ({
  authService: {
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    getSession: async () => ({ data: { session: null }, error: null }),
    ensureProfile: async () => ({ data: null, error: null }),
  },
}));

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------
async function mountSession(words = W_TYPING) {
  // Configure the central mock to return the desired words for the session
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

  // Wait for the main mock to be called, which signals the hook has run
  await waitFor(() => {
    expect(getLearnSessionQueueMock).toHaveBeenCalled();
  });
}

function pressKey(key) {
  fireEvent.keyDown(window, { key });
}

async function rateAndWaitGood() {
  await userEvent.click(screen.getByRole('button', { name: /^Good/ }));
  await waitFor(() => screen.getByText(/Tiếp tục/));
}

async function waitForFlashcard() {
  await waitFor(() => {
    const cards = screen.queryAllByRole('button', { pressed: false });
    if (cards.length !== 1) throw new Error('flashcard not ready');
  });
}

async function continueWithSpace() {
  pressKey(' ');
  await waitFor(() => true);
}
describe('LearningSession — TTS + keyboard + session behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    speakMock.mockImplementation(async () => {});
    recordResultMock.mockImplementation(async ({ userId, wordSenseId }) => ({
      progress: okProgress(userId, wordSenseId),
      error: null,
    }));
    cleanup();
  });

  afterEach(() => {
    cleanup();
  });

  // ---- TTS ----------------------------------------------------

  it('typing: auto-speaks the correct word on each reveal (card 1, 2, 3)', async () => {
    await mountSession(W_TYPING);
    await waitFor(() => screen.getByText('quả táo'));

    await userEvent.type(screen.getByPlaceholderText('Nhập từ tiếng Anh...'), 'apple');
    await userEvent.click(screen.getByRole('button', { name: /Kiểm tra/i }));
    expect(speakMock).toHaveBeenLastCalledWith('apple');
    await rateAndWaitGood();
    await userEvent.click(screen.getByRole('button', { name: /Tiếp tục/ }));

    await waitFor(() => screen.getByText('quả chuối'));
    await userEvent.type(screen.getByPlaceholderText('Nhập từ tiếng Anh...'), 'banana');
    await userEvent.click(screen.getByRole('button', { name: /Kiểm tra/i }));
    expect(speakMock).toHaveBeenLastCalledWith('banana');
    await rateAndWaitGood();
    await userEvent.click(screen.getByRole('button', { name: /Tiếp tục/ }));

    await waitFor(() => screen.getByText('quả anh đào'));
    await userEvent.type(screen.getByPlaceholderText('Nhập từ tiếng Anh...'), 'cherry');
    await userEvent.click(screen.getByRole('button', { name: /Kiểm tra/i }));
    expect(speakMock).toHaveBeenLastCalledWith('cherry');

    // No stale word from a previous card — exact speech order.
    expect(speakMock.mock.calls.map((c) => c[0])).toEqual(['apple', 'banana', 'cherry']);
  });

  it('flashcard: revealing each card auto-speaks exactly that card', async () => {
    await mountSession(W_FLASH);
    await waitForFlashcard();

    await userEvent.click(screen.getByRole('button', { pressed: false }));
    expect(speakMock).toHaveBeenLastCalledWith('apple');
    await rateAndWaitGood();
    await continueWithSpace();

    await waitForFlashcard();
    await userEvent.click(screen.getByRole('button', { pressed: false }));
    expect(speakMock).toHaveBeenLastCalledWith('banana');
    await rateAndWaitGood();
    await continueWithSpace();

    await waitForFlashcard();
    await userEvent.click(screen.getByRole('button', { pressed: false }));
    expect(speakMock).toHaveBeenLastCalledWith('cherry');

    expect(speakMock.mock.calls.map((c) => c[0])).toEqual(['apple', 'banana', 'cherry']);
  });

  it('clicking the 🔊 button speaks the current word on cards 1, 2 and 3', async () => {
    await mountSession(W_FLASH);
    await waitForFlashcard();

    // Card 1: manual 🔊 + reveal
    await userEvent.click(screen.getByRole('button', { name: 'Phát âm từ' }));
    expect(speakMock).toHaveBeenLastCalledWith('apple');
    await userEvent.click(screen.getByRole('button', { pressed: false }));
    expect(speakMock).toHaveBeenLastCalledWith('apple');
    await rateAndWaitGood();
    await continueWithSpace();

    // Card 2
    await waitForFlashcard();
    await userEvent.click(screen.getByRole('button', { name: 'Phát âm từ' }));
    expect(speakMock).toHaveBeenLastCalledWith('banana');
    await userEvent.click(screen.getByRole('button', { pressed: false }));
    expect(speakMock).toHaveBeenLastCalledWith('banana');
    await rateAndWaitGood();
    await continueWithSpace();

    // Card 3
    await waitForFlashcard();
    await userEvent.click(screen.getByRole('button', { name: 'Phát âm từ' }));
    expect(speakMock).toHaveBeenLastCalledWith('cherry');

    expect(speakMock.mock.calls.map((c) => c[0])).toEqual([
      'apple', 'apple',
      'banana', 'banana',
      'cherry',
    ]);
  });

  it('browser without speechSynthesis support does not crash or block the flow', async () => {
    // Simulate TTS throwing exactly like a broken / unavailable speechSynthesis.
    speakMock.mockImplementation(() => {
      throw new Error('speechSynthesis unavailable');
    });

    await mountSession(W_TYPING);
    await waitFor(() => screen.getByText('quả táo'));

    await userEvent.type(screen.getByPlaceholderText('Nhập từ tiếng Anh...'), 'apple');
    await userEvent.click(screen.getByRole('button', { name: /Kiểm tra/i }));

    // Reveal still works.
    await waitFor(() => screen.getByText(/Chính xác/));

    // Rating + continue still work.
    await rateAndWaitGood();
    await userEvent.click(screen.getByRole('button', { name: /Tiếp tục/ }));
    await waitFor(() => screen.getByText('quả chuối'));
  });
// ---- Keyboard: ENTER ----------------------------------------

  it('Enter before reveal submits; Enter after reveal does not rate; Enter after rating continues', async () => {
    await mountSession(W_TYPING);
    await waitFor(() => screen.getByText('quả táo'));

    // Enter before reveal -> submit answer
    await userEvent.type(screen.getByPlaceholderText('Nhập từ tiếng Anh...'), 'apple');
    pressKey('Enter');
    await waitFor(() => screen.getByText(/Chính xác/));
    expect(speakMock).toHaveBeenLastCalledWith('apple');

    // Enter after reveal but before rating -> no rating, no continue
    pressKey('Enter');
    expect(screen.getByRole('button', { name: /^Good/ })).toBeInTheDocument();
    expect(screen.queryByText(/Tiếp tục/)).not.toBeInTheDocument();

    // Enter after rating -> continue to card 2
    await rateAndWaitGood();
    pressKey('Enter');
    await waitFor(() => screen.getByText('quả chuối'));
  });

  // ---- Keyboard: SPACE ----------------------------------------

  it('Space after rating continues (card 2 -> card 3)', async () => {
    await mountSession(W_TYPING);
    await waitFor(() => screen.getByText('quả táo'));

    for (const [idx, word] of ['apple', 'banana'].entries()) {
      await userEvent.type(screen.getByPlaceholderText('Nhập từ tiếng Anh...'), word);
      await userEvent.click(screen.getByRole('button', { name: /Kiểm tra/i }));
      await waitFor(() => screen.getByText(/Chính xác|Chưa chính xác/));
      await rateAndWaitGood();
      pressKey(' ');
      const nextMeaning = idx === 0 ? 'quả chuối' : 'quả anh đào';
      await waitFor(() => screen.getByText(nextMeaning));
    }
  });

  it('Space while typing in the input inserts a normal space and does not advance', async () => {
    await mountSession([phraseWord]);
    await waitFor(() => screen.getByText('ăn sáng'));

    const input = screen.getByPlaceholderText('Nhập từ tiếng Anh...');
    await userEvent.type(input, 'have breakfast');

    expect(input.value).toBe('have breakfast');
    expect(screen.getByText('ăn sáng')).toBeInTheDocument();
    expect(screen.queryByText(/Tiếp tục/)).not.toBeInTheDocument();
  });

  it('Space before rating does not continue', async () => {
    await mountSession(W_TYPING);
    await waitFor(() => screen.getByText('quả táo'));

    await userEvent.type(screen.getByPlaceholderText('Nhập từ tiếng Anh...'), 'apple');
    await userEvent.click(screen.getByRole('button', { name: /Kiểm tra/i }));
    await waitFor(() => screen.getByText(/Chính xác/));

    pressKey(' ');
    // Still on the same card, no continue button.
    expect(screen.getByText('quả táo')).toBeInTheDocument();
    expect(screen.queryByText(/Tiếp tục/)).not.toBeInTheDocument();
  });

  it('Space does not continue while the rating save is in-flight', async () => {
    let resolveSave;
    recordResultMock.mockImplementation(
      () =>
        new Promise((res) => {
          resolveSave = res;
        })
    );

    await mountSession(W_TYPING);
    await waitFor(() => screen.getByText('quả táo'));

    await userEvent.type(screen.getByPlaceholderText('Nhập từ tiếng Anh...'), 'apple');
    await userEvent.click(screen.getByRole('button', { name: /Kiểm tra/i }));
    await waitFor(() => screen.getByText(/Chính xác/));
    await userEvent.click(screen.getByRole('button', { name: /^Good/ }));

    // Save still pending -> Space must not advance.
    pressKey(' ');
    expect(screen.getByText('quả táo')).toBeInTheDocument();
    expect(screen.queryByText(/Tiếp tục/)).not.toBeInTheDocument();

    // Let the save finish -> Space now continues.
    resolveSave({ progress: okProgress('user-1', 'w1'), error: null });
    await waitFor(() => screen.getByText(/Tiếp tục/));
    pressKey(' ');
    await waitFor(() => screen.getByText('quả chuối'));
  });

  it('Space does not continue after a DB save error (retry allowed)', async () => {
    recordResultMock.mockImplementation(async () => ({ progress: null, error: { message: 'boom' } }));

    await mountSession(W_TYPING);
    await waitFor(() => screen.getByText('quả táo'));

    await userEvent.type(screen.getByPlaceholderText('Nhập từ tiếng Anh...'), 'apple');
    await userEvent.click(screen.getByRole('button', { name: /Kiểm tra/i }));
    await userEvent.click(screen.getByRole('button', { name: /^Good/ }));

    await waitFor(() => screen.getByText(/Không thể lưu tiến trình học/));
    expect(screen.queryByText(/Tiếp tục/)).not.toBeInTheDocument();

    // Neither Space nor Enter may advance.
    pressKey(' ');
    pressKey('Enter');
    expect(screen.getByText('quả táo')).toBeInTheDocument();

    // The card is kept and rating can be retried.
    expect(screen.getByRole('button', { name: /^Good/ })).toBeInTheDocument();
  });
// ---- Session -------------------------------------------------

  it('no double advance when Space is held/spammed after rating', async () => {
    await mountSession(W_TYPING);
    await waitFor(() => screen.getByText('quả táo'));

    await userEvent.type(screen.getByPlaceholderText('Nhập từ tiếng Anh...'), 'apple');
    await userEvent.click(screen.getByRole('button', { name: /Kiểm tra/i }));
    await rateAndWaitGood();

    // Two Space keydowns in the same tick.
    pressKey(' ');
    pressKey(' ');

    // Exactly one advance: card 2 is current, card 3 is NOT skipped.
    await waitFor(() => screen.getByText('quả chuối'));
    expect(screen.queryByText('quả anh đào')).not.toBeInTheDocument();
  });

  it('Space has no side effect on the completed session screen', async () => {
    await mountSession([W_TYPING[0]]);
    await waitFor(() => screen.getByText('quả táo'));

    await userEvent.type(screen.getByPlaceholderText('Nhập từ tiếng Anh...'), 'apple');
    await userEvent.click(screen.getByRole('button', { name: /Kiểm tra/i }));
    await rateAndWaitGood();
    await userEvent.click(screen.getByRole('button', { name: /Tiếp tục/ }));

    await waitFor(() => screen.getByText('Hoàn thành phiên học!'));
    expect(speakMock).toHaveBeenLastCalledWith('apple');

    // Spamming Space on the completed screen must not crash or navigate.
    pressKey(' ');
    pressKey(' ');
    expect(screen.getByText('Hoàn thành phiên học!')).toBeInTheDocument();
  });

  // ---- Keyboard: SPACE + flashcard flip -----------------------

  it('flashcard: Space flips the card, prevents default (no scroll) and does not rate', async () => {
    await mountSession(W_FLASH);
    await waitForFlashcard();

    // Front of the card visible.
    expect(screen.getByText('apple')).toBeInTheDocument();

    const ev = new KeyboardEvent('keydown', {
      key: ' ',
      code: 'Space',
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(ev);

    // preventDefault called → the page must not scroll.
    expect(ev.defaultPrevented).toBe(true);

    // Card is now flipped → answer details (meaning) + rating buttons appear.
    await waitFor(() => screen.getByText('quả táo'));
    expect(screen.getByRole('button', { name: /^Good/ })).toBeInTheDocument();
  });

  it('typing: Space when not in an input does not reveal/rate/advance (no flip behavior)', async () => {
    await mountSession(W_TYPING);
    await waitFor(() => screen.getByText('quả táo'));

    // Move focus off the answer input so Space is handled by the session handler.
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }

    pressKey(' ');

    // Still on the same card: answer not submitted, nothing rated, no advance.
    expect(screen.getByText('quả táo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Kiểm tra/ })).toBeInTheDocument();
    expect(screen.queryByText(/Chính xác/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Tiếp tục/)).not.toBeInTheDocument();
  });

  it('keyboard listener is removed on unmount (Space no longer flips the card)', async () => {
    await mountSession(W_FLASH);
    await waitForFlashcard();
    speakMock.mockClear();
    cleanup();

    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true })
    );

    // Flipping would have called TTS via handleFlip → speakWord; if the listener
    // were still attached, speakMock would have been called. It must not be.
    expect(speakMock).not.toHaveBeenCalled();
  });
});
