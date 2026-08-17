import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  waitFor,
  fireEvent,
  renderHook,
  act,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Hook under test (real) — uses ttsService from repo root.
import {
  usePracticeSession,
  continueCardFromDeck,
  reviewCardFromDeck,
  mergePracticeWords,
} from "../hooks/usePracticeSession.js";

// Mocks: TTS (real usage) + vocabulary.service (so the component loads words
// in jsdom). Learning/srs services are NOT mocked because the hook must never
// import them — this is asserted statically (test 8).
const speakMock = vi.fn(async () => {});
vi.mock("/home/asus/EngFore/tts.service.js", () => ({
  ttsService: { isSupported: () => true, speak: (...a) => speakMock(...a) },
}));
vi.mock("../../tts.service.js", () => ({
  ttsService: { isSupported: () => true, speak: (...a) => speakMock(...a) },
}));
vi.mock("../../../tts.service.js", () => ({
  ttsService: { isSupported: () => true, speak: (...a) => speakMock(...a) },
}));
vi.mock("../services/vocabulary.service.js", () => ({
  getWordsInSet: vi.fn(),
}));
vi.mock("../services/auth.service.js", () => ({
  authService: {
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    getSession: async () => ({ data: { session: null }, error: null }),
    ensureProfile: async () => ({ data: null, error: null }),
  },
}));
import PracticeSession from "../pages/PracticeSession/index.jsx";
import { getWordsInSet } from "../services/vocabulary.service.js";
import { AuthProvider } from "../hooks/useAuth.jsx";

const WORDS = [
  { id: "w1", word: "apple", meaning: "quả táo" },
  { id: "w2", word: "banana", meaning: "quả chuối" },
  { id: "w3", word: "cherry", meaning: "quả anh đào" },
].map((w) => ({
  ...w,
  ipa: "/" + w.word + "/",
  word_type: "noun",
  example: "ex " + w.word,
  memory_clue: "clue " + w.word,
  cefr_level: "A1",
}));

// Alias used by the pure-helper tests
const W = WORDS;

describe("deck helpers (pure)", () => {
  it("continueCardFromDeck removes the current card and keeps the rest ordered", () => {
    const { queue, completed } = continueCardFromDeck(W, 0);
    expect(completed).toEqual(W[0]);
    expect(queue.map((w) => w.word)).toEqual(["banana", "cherry"]);
  });

  it("continueCardFromDeck on the last remaining card empties the deck", () => {
    const only = [W[0]];
    const { queue, completed, currentIndex } = continueCardFromDeck(only, 0);
    expect(completed).toEqual(W[0]);
    expect(queue).toEqual([]);
    expect(currentIndex).toBe(0);
  });

  it("continueCardFromDeck shrinks index when removing a middle card", () => {
    const { queue, currentIndex } = continueCardFromDeck(W, 1);
    expect(queue.map((w) => w.word)).toEqual(["apple", "cherry"]);
    expect(currentIndex).toBe(1);
  });

  it("reviewCardFromDeck re-inserts the card after the next one", () => {
    const { queue, currentIndex } = reviewCardFromDeck(W, 0);
    expect(queue.map((w) => w.word)).toEqual(["banana", "apple", "cherry"]);
    expect(currentIndex).toBe(0);
  });

  it("reviewCardFromDeck on the last card keeps it pending and wraps index to 0", () => {
    const { queue, currentIndex } = reviewCardFromDeck(W, 2);
    expect(queue.map((w) => w.word)).toEqual(["apple", "banana", "cherry"]);
    expect(currentIndex).toBe(0);
  });

  it("reviewCardFromDeck with a single card keeps it", () => {
    const only = [W[0]];
    expect(reviewCardFromDeck(only, 0).queue).toEqual(only);
  });

  it("mergePracticeWords dedupes by id and flattens multiple sets", () => {
    const a = [W[0], W[1]];
    const b = [W[1], W[2]];
    expect(mergePracticeWords([a, b]).map((w) => w.word)).toEqual([
      "apple",
      "banana",
      "cherry",
    ]);
  });

  it("mergePracticeWords tolerates null/undefined entries", () => {
    const out = mergePracticeWords([null, undefined, [W[0]], []]);
    expect(out.map((w) => w.word)).toEqual(["apple"]);
  });
});

describe("usePracticeSession hook", () => {
  beforeEach(() => speakMock.mockClear());

  it("starts in mode-selection (no mode) with null currentWord", () => {
    const { result } = renderHook(() => usePracticeSession(W));
    expect(result.current.sessionMode).toBeNull();
    expect(result.current.isComplete).toBe(false);
    expect(result.current.currentWord).toBeNull();
  });

  it("startSession flashcard sets mode and currentWord to first card", () => {
    const { result } = renderHook(() => usePracticeSession(W));
    act(() => result.current.startSession("flashcard"));
    expect(result.current.sessionMode).toBe("flashcard");
    expect(result.current.currentWord).toEqual(W[0]);
    expect(result.current.queue.length).toBe(3);
  });

  it("flashcard: flipCard reveals and speaks the current word", () => {
    const { result } = renderHook(() => usePracticeSession(W));
    act(() => result.current.startSession("flashcard"));
    expect(result.current.flipped).toBe(false);
    act(() => result.current.flipCard());
    expect(result.current.flipped).toBe(true);
    expect(speakMock).toHaveBeenCalledWith("apple");
  });

  it("flashcard: flipCard is a no-op once already flipped", () => {
    const { result } = renderHook(() => usePracticeSession(W));
    act(() => result.current.startSession("flashcard"));
    act(() => result.current.flipCard());
    act(() => result.current.flipCard());
    expect(speakMock).toHaveBeenCalledTimes(1);
  });

  it("flashcard: handleContinue blocked until flipped (canAct false)", () => {
    const { result } = renderHook(() => usePracticeSession(W));
    act(() => result.current.startSession("flashcard"));
    expect(result.current.canAct).toBe(false);
    act(() => result.current.handleContinue());
    expect(result.current.currentWord).toEqual(W[0]);
  });

  it("flashcard: continue after reveal advances and counts completed", () => {
    const { result } = renderHook(() => usePracticeSession(W));
    act(() => result.current.startSession("flashcard"));
    act(() => result.current.flipCard());
    act(() => result.current.handleContinue());
    expect(result.current.currentWord).toEqual(W[1]);
    expect(result.current.completedCount).toBe(1);
    expect(result.current.flipped).toBe(false);
  });

  it("flashcard: handleReview re-inserts the card for later", () => {
    const { result } = renderHook(() => usePracticeSession(W));
    act(() => result.current.startSession("flashcard"));
    act(() => result.current.flipCard());
    act(() => result.current.handleReview());
    expect(result.current.currentWord?.word).toBe("banana");
    expect(result.current.queue.map((w) => w.word)).toEqual([
      "banana",
      "apple",
      "cherry",
    ]);
  });

  it("typing: submit correct flags feedback and speaks", () => {
    const { result } = renderHook(() => usePracticeSession(W));
    act(() => result.current.startSession("typing"));
    act(() => result.current.setInput("apple"));
    act(() => result.current.submitAnswer());
    expect(result.current.feedback).toEqual({ status: "correct" });
    expect(result.current.answered).toBe(true);
    expect(speakMock).toHaveBeenCalledWith("apple");
  });

  it("typing: submit incorrect is flagged incorrect", () => {
    const { result } = renderHook(() => usePracticeSession(W));
    act(() => result.current.startSession("typing"));
    act(() => result.current.setInput("apfel"));
    act(() => result.current.submitAnswer());
    expect(result.current.feedback).toEqual({ status: "incorrect" });
    expect(result.current.answered).toBe(true);
  });

  it("typing: cannot double-submit", () => {
    const { result } = renderHook(() => usePracticeSession(W));
    act(() => result.current.startSession("typing"));
    act(() => result.current.setInput("apple"));
    act(() => result.current.submitAnswer());
    speakMock.mockClear();
    act(() => result.current.submitAnswer());
    expect(speakMock).not.toHaveBeenCalled();
  });

  it("typing: cannot continue before answering (canAct false)", () => {
    const { result } = renderHook(() => usePracticeSession(W));
    act(() => result.current.startSession("typing"));
    expect(result.current.canAct).toBe(false);
    act(() => result.current.handleContinue());
    expect(result.current.currentWord).toEqual(W[0]);
  });
});

// ---------------------------------------------------------------
// Mandated "Học ngay" wrong-answer auto-review behaviour (NO SRS)
// ---------------------------------------------------------------
describe("typing auto-review on wrong answer", () => {
  beforeEach(() => speakMock.mockClear());

  it("1. correct answer does NOT requeue (queue + currentWord unchanged)", () => {
    const { result } = renderHook(() => usePracticeSession(W));
    act(() => result.current.startSession("typing"));
    act(() => result.current.setInput("apple"));
    act(() => result.current.submitAnswer());
    // Correct -> not flagged for review, queue untouched, still on A.
    expect(result.current.feedback).toEqual({ status: "correct" });
    expect(result.current.isReviewNeeded).toBe(false);
    expect(result.current.queue.length).toBe(3);
    expect(result.current.currentWord).toEqual(W[0]);
  });

  it("2. wrong answer auto-marks card for review (no immediate requeue)", () => {
    const { result } = renderHook(() => usePracticeSession(W));
    act(() => result.current.startSession("typing"));
    act(() => result.current.setInput("wrong"));
    act(() => result.current.submitAnswer());
    expect(result.current.feedback).toEqual({ status: "incorrect" });
    expect(result.current.isReviewNeeded).toBe(true); // A flagged -> will be requeued on Continue
    expect(result.current.queue.length).toBe(3); // queue NOT changed yet
  });

  it("3. wrong card is re-enqueued after the next card on Continue", () => {
    const { result } = renderHook(() => usePracticeSession(W));
    act(() => result.current.startSession("typing"));
    act(() => result.current.setInput("wrong"));
    act(() => result.current.submitAnswer()); // A wrong -> flagged
    act(() => result.current.handleContinue()); // auto-requeue A -> next is B
    // Next card shown is B (banana); A still pending in the queue.
    expect(result.current.currentWord).toEqual(W[1]); // banana
    expect(result.current.queue.map((w) => w.word)).toEqual([
      "banana",
      "apple",
      "cherry",
    ]);
    expect(result.current.completedCount).toBe(0); // A not completed (requeued)
    expect(result.current.isReviewNeeded).toBe(false); // current is B (not flagged)
  });

  it("4. wrong again keeps requeuing the card", () => {
    const { result } = renderHook(() => usePracticeSession(W));
    act(() => result.current.startSession("typing"));
    act(() => result.current.setInput("wrong"));
    act(() => result.current.submitAnswer()); // A wrong -> flagged
    act(() => result.current.handleContinue()); // -> B, A queued as [B,A,C]
    act(() => result.current.setInput("b"));
    act(() => result.current.submitAnswer()); // B correct
    act(() => result.current.handleContinue()); // -> A (reappeared), B completed
    expect(result.current.currentWord).toEqual(W[0]); // A
    expect(result.current.isReviewNeeded).toBe(true); // A still flagged
    act(() => result.current.setInput("wrong"));
    act(() => result.current.submitAnswer()); // A wrong again
    act(() => result.current.handleContinue()); // requeue A again
    expect(result.current.queue.map((w) => w.word)).toContain("apple");
    expect(result.current.completedCount).toBe(1); // only B done
  });

  it("5. review card answered correctly is NOT requeued anymore", () => {
    const { result } = renderHook(() => usePracticeSession(W));
    act(() => result.current.startSession("typing"));
    act(() => result.current.setInput("wrong"));
    act(() => result.current.submitAnswer()); // A wrong -> flagged
    act(() => result.current.handleContinue()); // -> B, A queued
    act(() => result.current.setInput("b"));
    act(() => result.current.submitAnswer()); // B correct
    act(() => result.current.handleContinue()); // -> A (reappeared)
    expect(result.current.currentWord).toEqual(W[0]);
    expect(result.current.isReviewNeeded).toBe(true);
    act(() => result.current.setInput("apple"));
    act(() => result.current.submitAnswer()); // A correct -> flag cleared
    expect(result.current.isReviewNeeded).toBe(false);
  });

  it("6. session NOT complete while a wrong card is still pending review", () => {
    const { result } = renderHook(() => usePracticeSession(W));
    act(() => result.current.startSession("typing"));
    act(() => result.current.setInput("wrong"));
    act(() => result.current.submitAnswer()); // A wrong -> flagged
    act(() => result.current.handleContinue()); // -> B, A queued [B,A,C]
    act(() => result.current.setInput("b"));
    act(() => result.current.submitAnswer()); // B correct
    act(() => result.current.handleContinue()); // -> A (reappeared)
    // A still flagged & queued -> session not complete.
    expect(result.current.isComplete).toBe(false);
    expect(result.current.isReviewNeeded).toBe(true);
    expect(result.current.queue.map((w) => w.word)).toEqual([
      "apple",
      "cherry",
    ]);
  });

  it("7. session completes only when every card has been answered correctly", () => {
    const { result } = renderHook(() => usePracticeSession(W));
    act(() => result.current.startSession("typing"));
    // A correct
    act(() => result.current.setInput("apple"));
    act(() => result.current.submitAnswer());
    act(() => result.current.handleContinue());
    // B correct
    act(() => result.current.setInput("b"));
    act(() => result.current.submitAnswer());
    act(() => result.current.handleContinue());
    // C correct -> deck empty
    act(() => result.current.setInput("cherry"));
    act(() => result.current.submitAnswer());
    act(() => result.current.handleContinue());
    expect(result.current.isComplete).toBe(true);
    expect(result.current.completedCount).toBe(3);
    expect(result.current.currentWord).toBeNull();
  });

  it("8. PracticeSession is SRS-free: hook source never touches user_progress", () => {
    // Static guard: the hook module must not import or call any SRS/progress API.
    const src = readFileSync(
      resolve(process.cwd(), "src/hooks/usePracticeSession.js"),
      "utf8",
    );
    const forbidden = [
      "recordLearningResult",
      "recordProgress",
      "computeSrsPayload",
      "computeSrsUpdate",
      "user_progress",
      "review_due_at",
      "repetitions",
      "ease_factor",
      "lapses",
      "flashcard_reviews",
    ];
    forbidden.forEach((token) => {
      expect(src).not.toContain(token);
    });
    // It must still use TTS (the only external dependency allowed).
    expect(src).toContain("ttsService");
  });
});

describe("keyboard in PracticeSession", () => {
  beforeEach(() => speakMock.mockClear());

  it('9. flashcard "Xem lại" still requeues the card (Enter continues)', async () => {
    getWordsInSet.mockResolvedValue({ data: W, error: null });
    render(
      <MemoryRouter initialEntries={["/practice/session?setIds=set-1"]}>
        <AuthProvider initialUser={{ id: "user-1" }}>
          <PracticeSession />
        </AuthProvider>
      </MemoryRouter>,
    );
    await screen.findByText(/Flashcard/i);
    await userEvent.click(screen.getByText(/Flashcard/i));
    await waitFor(() => expect(speakMock).toHaveBeenCalledWith("apple")); // flip auto-speaks
    // Enter continues after reveal -> next card B (banana)
    fireEvent.keyDown(window, { key: "Enter" });
    await waitFor(() => screen.getByText("quả chuối"));
  });

  it("10. typing: Enter submits; Space continues & auto-requeues a wrong card", async () => {
    getWordsInSet.mockResolvedValue({ data: W, error: null });
    render(
      <MemoryRouter initialEntries={["/practice/session?setIds=set-1"]}>
        <AuthProvider initialUser={{ id: "user-1" }}>
          <PracticeSession />
        </AuthProvider>
      </MemoryRouter>,
    );
    // Choose typing mode
    await screen.findByText(/Flashcard/i);
    await userEvent.click(screen.getByText(/Gõ từ/i));
    const input = await screen.findByPlaceholderText(/Nhập từ/i);
    await userEvent.type(input, "wrong-answer");
    // Enter -> submit -> wrong reveal
    fireEvent.keyDown(window, { key: "Enter" });
    await waitFor(() => screen.getByText(/Chưa chính xác/));
    expect(screen.getByText(/Đáp án đúng/)).toBeInTheDocument();
    expect(
      screen.getByText(/xem lại trong phiên luyện tập/),
    ).toBeInTheDocument();
    // Space -> continue -> auto-requeue wrong card, move to next (banana)
    fireEvent.keyDown(window, { key: " " });
    await waitFor(() => screen.getByText("quả chuối"));
    // The wrong card (apple) is still pending somewhere in the queue.
    expect(screen.queryByText(/Chưa chính xác/)).not.toBeInTheDocument();
  });
});
