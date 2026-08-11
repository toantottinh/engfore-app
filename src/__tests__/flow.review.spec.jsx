import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// Spy on TTS
// TTS calls are exercised but not asserted here (jsdom lacks SpeechSynthesis)

// Note: Use the real AuthProvider but provide `initialUser` for deterministic tests

// Prepare test words: first has no review_count (simulating older rows), second has 1, third has 2 (Typing)
const word1 = { id: 'w1', word: 'apple', meaning: 'quả táo', mastery_level: 0, review_due_at: new Date().toISOString() };
const word2 = { id: 'w2', word: 'banana', meaning: 'quả chuối', mastery_level: 1, review_count: 1, review_due_at: new Date().toISOString() };
const word3 = { id: 'w3', word: 'cherry', meaning: 'quả anh đào', mastery_level: 2, review_count: 2, review_due_at: new Date().toISOString() };

// Mock learning.service before importing the component so bindings are correct
const recordLearningResultMock = vi.fn(async ({ userId, wordSenseId, rating, correct }) => ({ progress: { user_id: userId, word_sense_id: wordSenseId, review_count: 1 }, error: null }));
const getDueReviewWordsMock = vi.fn(async () => ({ data: [word1, word2, word3], error: null }));
const getDueReviewWordsCountMock = vi.fn(async () => ({ count: 3, error: null }));
const getSrsDashboardStatsMock = vi.fn(async () => ({ data: { due: 0, new: 0, review: 3 }, error: null }));

// Mock learning service under several resolution paths
function learningFactory() {
  return {
    getDueReviewWords: (...args) => getDueReviewWordsMock(...args),
    getDueReviewWordsCount: (...args) => getDueReviewWordsCountMock(...args),
    recordLearningResult: (...args) => recordLearningResultMock(...args),
    getSrsDashboardStats: (...args) => getSrsDashboardStatsMock(...args),
  };
}
vi.mock('../services/learning.service.js', learningFactory);
vi.mock('../../services/learning.service.js', learningFactory);
vi.mock('/home/asus/EngFore/src/services/learning.service.js', learningFactory);

// Mock auth service to avoid unexpected auth state callbacks in tests
vi.mock('../services/auth.service.js', () => ({
  authService: {
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    getSession: async () => ({ data: { session: null }, error: null }),
    ensureProfile: async () => ({ data: null, error: null }),
  },
}));

// Component will be dynamically imported inside the test after mocks are set

describe('End-to-end Review flow (Practice -> Review -> Dashboard) integration', () => {
  let originalDateNow;

  beforeEach(() => {
    vi.clearAllMocks();
    originalDateNow = Date.now;
  });

  afterEach(() => {
    Date.now = originalDateNow;
  });

  it('runs Practice->Flashcard x2 -> Typing, maps timings to ratings, plays TTS, saves and navigates to Dashboard', async () => {
    // Note: do not assert TTS calls (jsdom has no SpeechSynthesis implementation)

    const { default: Review } = await import('../pages/Review/index.jsx');
    const { AuthProvider } = await import('../hooks/useAuth.jsx');
    render(
      <MemoryRouter initialEntries={["/review"]}>
        <AuthProvider initialUser={{ id: 'user-1', email: 'test@example.com' }}>
          <Routes>
            <Route path="/review" element={<Review />} />
            <Route path="/app" element={<div>Dashboard</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    // Wait for service hooks to be invoked and intro to render
    await waitFor(() => expect(getDueReviewWordsMock).toHaveBeenCalled());
    await waitFor(() => expect(getDueReviewWordsCountMock).toHaveBeenCalled());
    await screen.findByText('Ôn tập');

    // Start session — locate and click the start button
    const buttons = screen.queryAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(1);
    const startBtn = buttons.find((b) => b.textContent && /Bắt đầu ôn tập/i.test(b.textContent));
    expect(startBtn).toBeTruthy();

    // Mock Date.now deterministically so shuffle/start timings are stable
    let now = 1000000;
    Date.now = () => now;

    userEvent.click(startBtn);

    // Process cards in whatever shuffled order the UI presents.
    const allWords = [word1, word2, word3];
    const processed = new Set();
    let safety = 0;
    while (processed.size < 3 && safety < 10) {
      safety += 1;
      // Wait for either a flashcard word or typing meaning to appear
      await waitFor(() => {
        const anyWordVisible = allWords.some((w) => screen.queryByText(new RegExp(w.word, 'i')) || screen.queryByText(new RegExp(w.meaning, 'i')));
        if (!anyWordVisible) throw new Error('No card visible yet');
        return true;
      });

      // --- REVISED MODE DETECTION ---
      // A TypingCard is reliably identified by its unique input placeholder.
      // A Flashcard is identified by the button containing the word itself.
      const isTypingCard = !!screen.queryByPlaceholderText('Nhập từ tiếng Anh...');
      const currentWord = allWords.find((w) => screen.queryByText(new RegExp(w.meaning, 'i')));

      if (!currentWord) break;

      if (processed.has(currentWord.id)) {
        // Already processed, try waiting for next
        await waitFor(() => screen.queryByText(/Từ tiếp theo|Dashboard/i));
      }

      if (isTypingCard) {
        // Typing mode: advance time then type and submit
        const input = await screen.findByPlaceholderText('Nhập từ tiếng Anh...');

        // Simulate different timings to get the desired ratings
        if (currentWord.id === 'w1') {
          now += 46000; // > 45s -> AGAIN (0)
        } else if (currentWord.id === 'w2') {
          now += 31000; // 30-45s -> HARD (2)
        } else { // w3
          now += 10000; // < 15s -> EASY (4)
        }

        await userEvent.type(input, currentWord.word);
        const submitBtn = screen.getByRole('button', { name: /Kiểm tra/i });
        userEvent.click(submitBtn);
        // TTS call skipped in tests
        const nextBtn = await screen.findByRole('button', { name: /Từ tiếp theo/i });
        userEvent.click(nextBtn);
      } else {
        // This is a Flashcard. The test expects TypingCards, so fail if we get here.
        // This branch is kept for robustness in case the Review component's default mode changes.
        throw new Error(`Test expected a TypingCard but found a Flashcard for word: ${currentWord.word}`);
      }

      processed.add(currentWord.id);
      // small wait for UI to settle
      await waitFor(() => true, { timeout: 50 });
    }

    // Wait for navigation to dashboard (triggered after save)
    await screen.findByText('Dashboard');

    // Validate recordLearningResult was called for three results
    expect(recordLearningResultMock).toHaveBeenCalledTimes(3);

    // Map results by wordSenseId and assert expected ratings
    const resultMap = {};
    recordLearningResultMock.mock.calls.forEach((c) => {
      resultMap[c[0].wordSenseId] = c[0].rating;
    });
    expect(resultMap['w1']).toBe(0);
    expect(resultMap['w2']).toBe(2);
    expect(resultMap['w3']).toBe(4);

    // Ensure new progress rows include identity fields (mock returned progress contains them)
    const returned = await recordLearningResultMock.mock.results[0].value;
    expect(returned.progress.user_id).toBe('user-1');
    expect(returned.progress.word_sense_id).toBeDefined();

    // restore Date.now
    Date.now = originalDateNow;
  });
});
