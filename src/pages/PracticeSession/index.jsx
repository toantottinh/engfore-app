import React, { useState, useEffect, useRef, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getWordsInSet } from "../../services/vocabulary.service.js";
import {
  usePracticeSession,
  mergePracticeWords,
} from "../../hooks/usePracticeSession.js";
import VocabularyAnswerDetails from "../../components/VocabularyAnswerDetails.jsx";
import Button from "../../components/ui/Button.jsx";
import Spinner from "../../components/ui/Spinner.jsx";
import Alert from "../../components/ui/Alert.jsx";
import EmptyState from "../../components/ui/EmptyState.jsx";

/**
 * "Học ngay" — Phiên luyện tập riêng của bộ từ.
 * KHÁC "Học ngắt quãng" (SRS): KHÔNG ghi user_progress, KHÔNG gọi
 * recordLearningResult / computeSrs*, chỉ có [Tiếp tục] / [Xem lại].
 * Hỗ trợ nhiều bộ qua URL: /practice/session?setIds=a,b,c
 */
export default function PracticeSession() {
  const [searchParams] = useSearchParams();
  const setIds = useMemo(
    () =>
      (searchParams.get("setIds") || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    [searchParams],
  );

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [words, setWords] = useState([]);

  const inputRef = useRef(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setLoadError(false);
      if (setIds.length === 0) {
        setWords([]);
        setLoading(false);
        return;
      }
      const results = await Promise.all(setIds.map((id) => getWordsInSet(id)));
      if (!active) return;
      const failed = results.find((r) => r.error);
      if (failed) {
        setLoadError(true);
        setLoading(false);
        return;
      }
      setWords(mergePracticeWords(results.map((r) => r.data || [])));
      setLoading(false);
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setIds.join(",")]);

  const {
    sessionMode,
    queue,
    currentIndex,
    currentWord,
    flipped,
    input,
    feedback,
    answered,
    isComplete,
    completedCount,
    canAct,
    startSession,
    flipCard,
    submitAnswer,
    handleContinue,
    handleReview,
    speakCurrent,
    setInput,
  } = usePracticeSession(words);

    // Auto focus ô nhập khi bắt đầu typing của mỗi card.
  useEffect(() => {
    if (sessionMode === "typing" && !answered && inputRef.current) {
      inputRef.current.focus();
    }
  }, [sessionMode, answered, currentWord]);

  // Auto-flip + speak khi chuyển sang flashcard mode (UX "Học ngay").
  useEffect(() => {
    if (sessionMode === "flashcard" && currentWord && !flipped) {
      flipCard();
    }
  }, [sessionMode, currentWord, flipped, flipCard]);

  // Keyboard: Enter = reveal/check/continue; Space = continue sau khi đã trả lời.
  useEffect(() => {
    const handler = (e) => {
      if (isComplete || !sessionMode) return;

      const el = document.activeElement;
      const isTypingTarget =
        !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA");

      if (e.key === " " || e.code === "Space") {
        // Khi đang nhập (chưa trả lời): Space gõ bình thường.
        // Khi đã trả lời (reveal): Space = Continue (cả đúng và sai).
        if (isTypingTarget && !answered) return;
        if (canAct) {
          e.preventDefault();
          handleContinue();
        } else {
          e.preventDefault(); // không để Space kích hoạt nút ngoài ý muốn
        }
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        if (sessionMode === "flashcard") {
          if (!flipped) flipCard();
          else handleContinue();
          return;
        }
        if (sessionMode === "typing") {
          if (!answered) submitAnswer();
          else handleContinue();
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    sessionMode,
    flipped,
    answered,
    canAct,
    isComplete,
    flipCard,
    submitAnswer,
    handleContinue,
  ]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  if (setIds.length === 0) {
    return (
      <EmptyState
        icon="🎯"
        title="Chưa chọn bộ từ nào"
        description="Hãy quay lại trang Bộ từ và chọn ít nhất một bộ trước khi bắt đầu Học ngay."
                action={
          <Link
            to="/vocabulary"
            className="inline-flex items-center gap-2 rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-white hover:bg-brand-primary-hover"
          >
            ← Về Bộ từ
          </Link>
        }
      />
    );
  }

  if (loadError) {
    return (
      <div className="space-y-4">
        <Alert
          type="error"
          message="Không thể tải từ vựng. Vui lòng thử lại."
        />
                <Link
          to="/vocabulary"
          className="inline-flex items-center gap-2 text-sm font-medium text-brand-primary hover:text-brand-primary-hover"
        >
          ← Về Bộ từ
        </Link>
      </div>
    );
  }

  // Màn hình hoàn thành
  if (isComplete) {
    return (
      <div className="mx-auto max-w-md rounded-card border border-border-color bg-surface-sidebar p-8 text-center shadow-sm">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-success-soft text-3xl">
          🎉
        </div>
        <h2 className="mt-4 text-2xl font-bold tracking-tight text-text-primary">
          Hoàn thành!
        </h2>
        <p className="mt-2 text-text-secondary">
          Bạn đã hoàn thành {completedCount} từ.
        </p>
        <Link
          to="/vocabulary"
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-primary-hover"
        >
          ← Về Bộ từ
        </Link>
      </div>
    );
  }

  if (words.length === 0) {
    return (
      <EmptyState
        icon="📝"
        title="Bộ từ này chưa có từ nào"
        description="Hãy thêm từ vựng trước khi bắt đầu Học ngay."
                action={
          <Link
            to="/vocabulary"
            className="text-sm font-medium text-brand-primary hover:text-brand-primary-hover"
          >
            ← Về Bộ từ
          </Link>
        }
      />
    );
  }

  // Màn hình chọn cách học
  if (!sessionMode) {
    return (
      <div className="mx-auto max-w-md rounded-card border border-border-color bg-surface-sidebar p-8 text-center shadow-sm">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-brand-primary-soft text-2xl">
          🎯
        </div>
        <h2 className="mt-4 text-2xl font-bold tracking-tight text-text-primary">
          Học từ vựng ngay
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          {words.length} từ · {setIds.length} bộ
        </p>
        <p className="mt-6 text-xs font-medium uppercase tracking-widest text-text-secondary">
          Chọn cách học
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Button size="lg" onClick={() => startSession("flashcard")}>
            <span aria-hidden="true">🃏</span> Flashcard
          </Button>
          <Button
            size="lg"
            variant="secondary"
            onClick={() => startSession("typing")}
          >
            <span aria-hidden="true">⌨️</span> Gõ từ
          </Button>
        </div>
      </div>
    );
  }
  // Phiên luyện tập
  return (
    <div className="mx-auto max-w-xl space-y-6 py-4">
      {/* Header progress */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-secondary">
          Card {currentIndex + 1} / {queue.length}
        </p>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-sidebar px-3 py-1 text-xs font-medium text-text-secondary">
          <i className="bx bx-play text-brand-primary" aria-hidden="true"></i>
          {sessionMode === "flashcard" ? "Flashcard" : "Gõ từ"}
        </span>
      </div>

      {!currentWord ? null : sessionMode === "flashcard" ? (
        <FlashcardView
          word={currentWord}
          flipped={flipped}
          onFlip={flipCard}
          onSpeak={speakCurrent}
          onContinue={handleContinue}
          onReview={handleReview}
        />
      ) : (
        <TypingView
          word={currentWord}
          input={input}
          onInput={setInput}
          answered={answered}
          feedback={feedback}
          onSubmit={submitAnswer}
          onSpeak={speakCurrent}
          onContinue={handleContinue}
          onReview={handleReview}
          inputRef={inputRef}
        />
      )}
    </div>
  );
}

function FlashcardView({
  word,
  flipped,
  onFlip,
  onSpeak,
  onContinue,
  onReview,
}) {
  return (
    <div className="space-y-4">
      <div
        role="button"
        tabIndex={0}
        onClick={onFlip}
        aria-pressed={flipped}
        className="relative flex min-h-[300px] w-full cursor-pointer flex-col items-center justify-center rounded-card border border-border-color bg-surface-sidebar p-8 text-center shadow-sm transition-all hover:shadow-md"
      >
        {!flipped ? (
          <>
            <p className="text-xs uppercase tracking-widest text-text-secondary">
              Từ vựng — bấm để lật
            </p>
            <div className="mt-4 flex items-center gap-1">
              <p className="text-4xl font-bold tracking-tight text-text-primary">
                {word.word}
              </p>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSpeak();
                }}
                aria-label="Phát âm từ"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-hover hover:text-brand-primary"
              >
                <span aria-hidden="true">🔊</span>
              </button>
            </div>
            {word.ipa && (
              <p className="mt-1 font-mono text-base text-text-secondary">
                /{word.ipa}/
              </p>
            )}
          </>
        ) : (
          <VocabularyAnswerDetails word={word} />
        )}
      </div>

      {flipped && (
        <div className="flex gap-3">
          <Button size="lg" className="flex-1" onClick={onContinue}>
            Tiếp tục
            <span className="text-xs font-normal opacity-70">Enter / Space</span>
          </Button>
          <Button
            size="lg"
            variant="ghost"
            className="flex-1"
            onClick={onReview}
          >
            Xem lại
            <span className="text-xs font-normal opacity-70">R</span>
          </Button>
        </div>
      )}
    </div>
  );
}

function TypingView({
  word,
  input,
  onInput,
  answered,
  feedback,
  onSubmit,
  onSpeak,
  onContinue,
  onReview,
  inputRef,
}) {
  return (
    <div className="space-y-5">
      <div className="px-2 text-center">
        <p className="text-xs font-medium uppercase tracking-widest text-text-secondary">
          Nghĩa tiếng Việt
        </p>
        <h3 className="mt-2 text-3xl font-bold tracking-tight text-text-primary">
          {word.meaning}
        </h3>
      </div>

      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => onInput(e.target.value)}
          disabled={answered}
          placeholder="Nhập từ tiếng Anh..."
          autoComplete="off"
          autoCapitalize="off"
          spellCheck="false"
          className="w-full rounded-card border border-border-color bg-surface-sidebar px-4 py-3 text-center text-xl text-text-primary placeholder:text-sm placeholder:text-text-secondary focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/40 disabled:bg-surface-hover"
        />
      </div>

      {!answered ? (
        <Button
          size="lg"
          className="w-full"
          onClick={onSubmit}
          disabled={!input.trim()}
        >
          Kiểm tra
          <span className="text-xs font-normal opacity-70">Enter</span>
        </Button>
      ) : (
        <div className="space-y-4">
          {feedback?.status === "incorrect" ? (
            <>
              <p className="rounded-card px-4 py-3 text-center text-sm font-medium bg-danger-soft text-danger">
                ✕ Chưa chính xác
              </p>
              <p className="text-center text-sm text-text-secondary">
                Đáp án đúng: <span className="font-semibold text-text-primary">{word.word}</span>
              </p>
            </>
          ) : (
            <p
              className={`rounded-card px-4 py-3 text-center text-sm font-medium ${
                feedback?.status === "correct"
                  ? "bg-success-soft text-success"
                  : "bg-danger-soft text-danger"
              }`}
            >
              {feedback?.status === "correct"
                ? "✓ Chính xác!"
                : "Chưa chính xác"}
            </p>
          )}
          <VocabularyAnswerDetails word={word} hideMeaning />
          {feedback?.status === "incorrect" && (
            <p className="flex items-center justify-center gap-1.5 text-sm text-text-secondary">
              <i className="bx bx-refresh text-brand-primary" aria-hidden="true"></i>
              Từ này sẽ được xem lại trong phiên luyện tập.
            </p>
          )}
          <div className="flex gap-3">
            <Button size="lg" className="flex-1" onClick={onContinue}>
              Tiếp tục
              <span className="text-xs font-normal opacity-70">Enter / Space</span>
            </Button>
            {/* "Xem lại" chỉ hiện khi trả lời đúng — sai sẽ tự động requeue */}
            {feedback?.status === "correct" && (
              <Button
                size="lg"
                variant="ghost"
                className="flex-1"
                onClick={onReview}
              >
                Xem lại
                <span className="text-xs font-normal opacity-70">R</span>
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
