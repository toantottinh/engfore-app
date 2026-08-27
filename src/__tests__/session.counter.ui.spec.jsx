import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// ------------------------------------------------------------------
// This test verifies the SESSION COUNTERS as actually rendered by the
// StatusCounts pills (🟢 Mới / 🔴 Again / 🟠 Ôn) through the full path:
//   user answer -> rating -> transition -> per-word state -> counters -> UI.
// It uses typing mode (flashcard_reviews >= threshold) exactly like the
// existing session tests so we can drive rating buttons realistically.
// ------------------------------------------------------------------

const TYPING = 2;

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
vi.mock('../services/auth.service.js', () => ({
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

// Read the currently rendered counter values from the status pills.
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
describe('LearningSession — session counters reflect per-word state, not button presses', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDailyNewProgressMock.mockImplementation(async () => ({ data: [], error: null }));
    getVocabularyStatsMock.mockImplementation(async () => ({ data: { total_count: 2000, learning_count: 800 }, error: null }));
  });
  afterEach(() => cleanup());

  it('NEW→AGAIN keeps the Mới count / repeated Again no change / GOOD completes NEW via the rendered UI', async () => {
    // Test dài (3 chu kỳ answer tuần tự với real timers) — chạy thật ca. 2.4s
    // khi đơn lẻ nhưng dễ chạm timeout 5s mặc định khi full suite chạy song
    // song. Nới timeout CHO RIÊNG test này (không đổi global config/behavior).
    await mountSession([NEW_WORD]);
    await waitFor(() => screen.getByText('quả táo'));
    expect(getCounts()).toEqual({ new: 1, again: 0, review: 0 });

    // Type a WRONG answer, reveal, then choose Again.
    // "Từ mới" semantics: a NEW word rated AGAIN has NOT completed its
    // introduction → it stays 🟢 Mới (the retry is tracked per queue instance,
    // NOT by the counters). Ôn/Again untouched.
    await typeAndReveal('xyz');
    await userEvent.click(screen.getByRole('button', { name: /^Again/ }));
    // Rating resolved once the requeue left a Continue button on screen.
    await userEvent.click(await screen.findByRole('button', { name: /Tiếp t/i }));
    expect(getCounts()).toEqual({ new: 1, again: 0, review: 0 });

    // Continue to the requeued copy and answer it WRONG again → Again changes nothing.
    await waitFor(() => screen.getByText('quả táo'));
    await typeAndReveal('nope');
    await userEvent.click(screen.getByRole('button', { name: /^Again/ }));
    await waitFor(() => screen.getByRole('button', { name: /Tiếp t/i }));
    expect(getCounts()).toEqual({ new: 1, again: 0, review: 0 });

    // Now answer the retry CORRECTLY (GOOD) → introduction COMPLETED: Mới -1.
    await userEvent.click(screen.getByRole('button', { name: /Tiếp t/i }));
    await waitFor(() => screen.getByText('quả táo'));
    await typeAndReveal('apple');
    await userEvent.click(screen.getByRole('button', { name: /^Good/ }));
    await waitFor(() => getCounts().new === 0);
    expect(getCounts()).toEqual({ new: 0, again: 0, review: 0 });
  }, 15000);

  it('REVIEW→Again: Ôn -1 / Again +1 / Mói unchanged', async () => {
    await mountSession([REVIEW_WORD]);
    await waitFor(() => screen.getByText('quả nâu'));
    expect(getCounts()).toEqual({ new: 0, again: 0, review: 1 });

    await typeAndReveal('nope');
    await userEvent.click(screen.getByRole('button', { name: /^Again/ }));
    await waitFor(() => getCounts().again === 1);
    expect(getCounts()).toEqual({ new: 0, again: 1, review: 0 });
  });
  it('REVIEW→HARD: Ôn -1 / Again unchanged / Mới unchanged via the rendered UI', async () => {
    await mountSession([REVIEW_WORD]);
    await waitFor(() => screen.getByText('quả nâu'));
    expect(getCounts()).toEqual({ new: 0, again: 0, review: 1 });

    await typeAndReveal('orange'); // correct
    await userEvent.click(screen.getByRole('button', { name: /^Hard/ }));
    await waitFor(() => getCounts().review === 0);
    // Bug fix: the REVIEW card leaves the yellow bucket. Again untouched.
    expect(getCounts()).toEqual({ new: 0, again: 0, review: 0 });
  });

  it('REVIEW→GOOD: Ôn -1 / Again unchanged / Mới unchanged via the rendered UI', async () => {
    await mountSession([REVIEW_WORD]);
    await waitFor(() => screen.getByText('quả nâu'));
    expect(getCounts()).toEqual({ new: 0, again: 0, review: 1 });

    await typeAndReveal('orange'); // correct
    await userEvent.click(screen.getByRole('button', { name: /^Good/ }));
    await waitFor(() => getCounts().review === 0);
    expect(getCounts()).toEqual({ new: 0, again: 0, review: 0 });
  });

  it('REVIEW→EASY: Ôn -1 / Again unchanged / Mới unchanged via the rendered UI', async () => {
    await mountSession([REVIEW_WORD]);
    await waitFor(() => screen.getByText('quả nâu'));
    expect(getCounts()).toEqual({ new: 0, again: 0, review: 1 });

    await typeAndReveal('orange'); // correct
    await userEvent.click(screen.getByRole('button', { name: /^Easy/ }));
    await waitFor(() => getCounts().review === 0);
    expect(getCounts()).toEqual({ new: 0, again: 0, review: 0 });
  });
});
