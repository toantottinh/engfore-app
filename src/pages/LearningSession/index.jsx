import React, { useState, useEffect, useRef, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { useLearningSession } from '../../hooks/useLearningSession.js';
import { ttsService } from '../../../tts.service.js';
import { formatReviewDue } from '../../utils/progress.js';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Modal from '../../components/ui/Modal.jsx';
import HelpModal, { HelpButton } from '../../components/HelpModal.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import Alert from '../../components/ui/Alert.jsx';
import StatusCounts from '../../components/ui/StatusCounts.jsx';
import VocabularyAnswerDetails from '../../components/VocabularyAnswerDetails.jsx';
import QuizExercise from '../../components/review/QuizExercise.jsx';
import { cefrBadgeClass, cefrLabel } from '../../utils/cefr.js';

const RATING_BUTTONS = [
  { key: 'again', label: 'Again', variant: 'danger', shortcut: '1' },
  { key: 'hard', label: 'Hard', variant: 'secondary', shortcut: '2' },
  { key: 'good', label: 'Good', variant: 'primary', shortcut: '3' },
  { key: 'easy', label: 'Easy', variant: 'success', shortcut: '4' },
];

// Format interval preview (e.g. "10 phút", "1 ngày", "4 ngày")
function formatIntervalPreview(iso) {
  if (!iso) return '';
  const diff = Date.parse(iso) - Date.now();
  if (Number.isNaN(diff) || diff <= 0) return 'ngay';
  const minutes = Math.round(diff / (1000 * 60));
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.round(diff / (1000 * 60 * 60));
  if (hours < 48) return `${hours} giờ`;
  const days = Math.round(diff / (1000 * 60 * 60 * 24));
  return `${days} ngày`;
}

// Hiển thị số liệu thống kê vốn từ theo định dạng VN (vd: 2.000).
const formatNumber = (n) => (Number(n) || 0).toLocaleString('vi-VN');

const LearningSession = () => {
  const { setId } = useParams();
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const ratingRef = useRef(null);

  const {
    loading,
    error,
    ratingError,
    currentWord,
    quizOptions,
    userInput,
    isAnswerRevealed,
    isCorrect,
    isSessionComplete,
    progress,
    lastReviewResult,
    isRated,
    isRating,
    mode,
    previewIntervals,
    wordsRemaining,
        sessionStatusCounts,
    stats,
    learnMode,
    setLearnMode,
    dailyNewLimit,
    introducedTodayCount,
    setUserInput,
    vocabularyStats,
    submitAnswer,
    handleRating,
    proceedToNext,
    sessionQueueLength,
    noWords,
  } = useLearningSession(setId);

  const questionMode = currentWord?.forcedMode === 'typing' ? 'typing' : mode;

  console.log("LEARNING SESSION CURRENT ITEM:", currentWord);

  const [exitModalOpen, setExitModalOpen] = useState(false);
  const isReadyToProceed = isRated && !isRating;
  const [helpOpen, setHelpOpen] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [autoEvalEnabled, setAutoEvalEnabled] = useState(() => {
    try {
      return window.localStorage.getItem('engfore.autoEvaluationEnabled') === 'true';
    } catch {
      return false;
    }
  });
  const [autoEvalModalOpen, setAutoEvalModalOpen] = useState(false);
  const toggleAutoEval = useCallback(() => {
    setAutoEvalEnabled((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem('engfore.autoEvaluationEnabled', String(next));
      } catch {}
      return next;
    });
  }, []);

  // Reset flip state khi đổi từ
  useEffect(() => {
    setFlipped(false);
  }, [currentWord?.id]);

  // Dọn dẹp phát âm khi unmount
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  useEffect(() => {
    if (questionMode === 'typing' && !isAnswerRevealed && inputRef.current) {
      inputRef.current.focus();
    }
  }, [questionMode, isAnswerRevealed, currentWord]);

  useEffect(() => {
    if (questionMode !== 'typing' || !isAnswerRevealed) return;
    const t = setTimeout(() => {
      requestAnimationFrame(() => {
        ratingRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
      });
    }, 120);
    return () => clearTimeout(t);
  }, [questionMode, isAnswerRevealed]);

    const speakWord = useCallback(() => {
    if (!currentWord) return;
    const text = currentWord.word;
    // Phát âm thanh ở macrotask để không chặn render chuyển câu.
    // Hủy âm thanh cũ chỉ khi âm thanh mới thực sự bắt đầu (trong ttsService).
    setTimeout(() => {
      try {
        ttsService.speak(text);
      } catch (e) {
        // TTS không được hỗ trợ — không làm gián đoạn học tập
      }
    }, 0);
  }, [currentWord]);

  // Typing: phát âm từ vựng + ví dụ ngay sau khi submit/reveal.
  const speakWordAndExample = useCallback(() => {
    if (!currentWord || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const synth = window.speechSynthesis;

    const textToSpeak = currentWord.word || currentWord.english || '';
    const exampleToSpeak = currentWord.example || currentWord.example_sentence || '';

    // Bọc trong setTimeout(0) để trình duyệt render xong UI trước, âm thanh chạy nền.
    // Hủy âm thanh cũ chỉ ngay trước khi giọng đọc mới thực sự bắt đầu.
    setTimeout(() => {
      try {
        synth.cancel();
      } catch (e) {}
      if (textToSpeak) {
        const wordUtterance = new SpeechSynthesisUtterance(textToSpeak);
        wordUtterance.lang = 'en-US';
        wordUtterance.rate = 0.9;

        if (exampleToSpeak) {
          wordUtterance.onend = () => {
            window.setTimeout(() => {
              const exUtterance = new SpeechSynthesisUtterance(exampleToSpeak);
              exUtterance.lang = 'en-US';
              exUtterance.rate = 0.9;
              synth.speak(exUtterance);
            }, 300);
          };
        }

        synth.speak(wordUtterance);
      }
    }, 0);
  }, [currentWord]);

  // Typing: phát âm ngay trong user action submit/reveal, đúng từ hiện tại.
  const handleSubmit = useCallback(() => {
    flushSync(() => {
      submitAnswer();
      if (autoEvalEnabled && currentWord) {
        const userAnswer = userInput.trim().toLowerCase();
        const correctAnswer = (currentWord.word || '').trim().toLowerCase();
        const correct = userAnswer === correctAnswer;
        handleRating(correct ? 'good' : 'again', !correct, correct);
      }
    });
    speakWordAndExample();
  }, [submitAnswer, speakWordAndExample, autoEvalEnabled, currentWord, userInput, handleRating]);

  // Flashcard: chỉ tự phát âm khi lật từ mặt trước sang mặt reveal.
  const handleFlip = useCallback(() => {
    if (isRated || flipped) return;
    setFlipped(true);
    speakWord();
  }, [isRated, flipped, speakWord]);

  // Chống double-advance khi bấm nút / Enter / Space trong cùng một nhịp.
  const advanceRef = useRef(true);
  const commitProceed = useCallback(() => {
    if (!advanceRef.current) return;
    advanceRef.current = false;
    // Không hủy âm thanh ở đây: để giọng đọc từ trước tự phát hết.
    flushSync(() => {
      proceedToNext();
    });
  }, [proceedToNext]);

  useEffect(() => {
    if (!isRated) advanceRef.current = true;
  }, [isRated]);

  const handleExit = () => {
    setExitModalOpen(true);
  };

  const confirmExit = () => {
    // A set session returns to that set. The global review queue returns to
    // the dashboard, which is the project's actual study-selection page;
    // navigating to /learn here would simply mount the same session again.
    navigate(setId ? `/vocabulary/${setId}` : '/app');
  };

  // Refs giữ trạng thái động để listener phím tắt được đăng ký MỘT LẦN duy nhất,
  // tránh re-subscribe (và rò rỉ listener) sau mỗi câu hỏi.
  const keyboardStateRef = useRef({
    mode: questionMode,
    isAnswerRevealed,
    isRated,
    isRating,
    flipped,
    isSessionComplete,
  });
  keyboardStateRef.current = {
    mode: questionMode,
    isAnswerRevealed,
    isRated,
    isRating,
    flipped,
    isSessionComplete,
  };
  const keyboardHandlersRef = useRef({
    handleSubmit,
    handleFlip,
    handleRating,
    commitProceed,
  });
  keyboardHandlersRef.current = {
    handleSubmit,
    handleFlip,
    handleRating,
    commitProceed,
  };

  // Keyboard: Enter = submit/flip/continue, Space = lật thẻ (flashcard) /
  // continue (sau rating), 1-4 = rating. Space không bao giờ submit hoặc rating.
  useEffect(() => {
    const handler = (e) => {
      const {
        mode: currentMode,
        isAnswerRevealed: revealedState,
        isRated: ratedState,
        isRating: ratingState,
        flipped: flippedState,
        isSessionComplete: sessionComplete,
      } = keyboardStateRef.current;
      const {
        handleSubmit: submit,
        handleFlip: flip,
        handleRating: rate,
        commitProceed: proceed,
      } = keyboardHandlersRef.current;

      if (sessionComplete) {
        if (e.repeat) return;
        if (e.code === 'Space' || e.key === ' ') {
          e.preventDefault();
          window.location.reload();
        }
        return;
      }

      const el = document.activeElement;
      const isTyping =
        !!el &&
        (el.tagName === 'INPUT' ||
          el.tagName === 'TEXTAREA' ||
          el.tagName === 'SELECT' ||
          el.isContentEditable);

      // SPACE
      if (e.key === ' ' || e.code === 'Space') {
        if (isTyping) return;
        const canContinue = ratedState && !ratingState;
        if (canContinue) {
          e.preventDefault();
          proceed();
          return;
        }
        if (currentMode === 'flashcard' && !flippedState) {
          e.preventDefault();
          flip();
          return;
        }
        e.preventDefault();
        return;
      }

      // ENTER
      if (e.key === 'Enter') {
        e.preventDefault();
        if (ratedState) {
          proceed();
          return;
        }
        if (currentMode === 'typing' && !revealedState) {
          submit();
          return;
        }
        if (currentMode === 'flashcard') {
          flip();
          return;
        }
        return;
      }

      // Keys 1-4
      const revealed = currentMode === 'flashcard' ? flippedState : revealedState;
      if (revealed && !ratedState && !ratingState) {
        const idx = ['1', '2', '3', '4'].indexOf(e.key);
        if (idx >= 0) {
          e.preventDefault();
          rate(RATING_BUTTONS[idx].key);
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);


  if (loading) {
    return <Spinner />;
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Alert type="error" message={error} className="max-w-md" />
        <div className="mt-4 text-center">
          <Button onClick={() => navigate(setId ? `/vocabulary/${setId}` : '/app')}>
            {setId ? 'Về bộ từ' : 'Về trang học'}
          </Button>
        </div>
      </div>
    );
  }

  if (isSessionComplete) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-4 text-center">
        <div className="rounded-lg bg-surface-default p-8 shadow-lg">
          <h2 className="text-4xl font-bold text-brand-primary">🎉</h2>
          <h3 className="mt-4 text-2xl font-bold text-text-primary">Hoàn thành phiên học!</h3>
          <p className="mt-2 text-text-secondary">
            Bạn đã hoàn thành{' '}
            <span className="font-semibold">{stats.attemptedWords.size}</span> từ duy nhất.
          </p>
          <div className="mt-6 space-y-2 text-left text-text-secondary">
            <p>
              <span className="font-semibold">Tổng số từ trong phiên:</span> {sessionQueueLength}
            </p>
            <p>
              <span className="font-semibold">Số từ trả lời đúng:</span> {stats.correctAnswers}
            </p>
            <p>
              <span className="font-semibold">Số từ cần ôn lại:</span> {stats.needsReview}
            </p>
            {stats.attemptedWords.size > 0 && (
              <p>
                <span className="font-semibold">Độ chính xác:</span>{' '}
                {((stats.correctAnswers / stats.attemptedWords.size) * 100).toFixed(0)}%
              </p>
            )}
          </div>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button variant="secondary" onClick={() => window.location.reload()}>
              <i className="bx bx-right-arrow-alt text-lg"></i>
              <span>Học tiếp · Space</span>
            </Button>
            <Button onClick={() => navigate(setId ? `/vocabulary/${setId}` : '/app')}>
              <i className="bx bx-folder-open text-lg"></i>
              <span>{setId ? 'Về bộ từ' : 'Về trang học'}</span>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Recoverable empty queue (e.g. LIMITED daily quota exhausted on the global
  // /learn scope) must fall through to the main render so the UNLIMITED toggle
  // + noWords notice stay visible instead of short-circuiting to a dead-end alert.
  const isGlobalRecoverableEmpty = Boolean(noWords) && (!setId || setId === 'all');
  if (!currentWord && !isGlobalRecoverableEmpty) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Alert type="info" message="Không có từ nào trong bộ từ này để học." className="max-w-md" />
        <div className="mt-4 text-center">
          <Button onClick={() => navigate(setId ? `/vocabulary/${setId}` : '/app')}>
            {setId ? 'Về bộ từ' : 'Về trang học'}
          </Button>
        </div>
      </div>
    );
  }

  const renderRatingButtons = () => (
    <div>
      <p className="mb-2 text-center text-xs font-medium uppercase tracking-wide text-text-secondary">
        Bạn nhớ từ này thế nào?
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {RATING_BUTTONS.map((btn) => (
          <button
            key={btn.key}
            onClick={() => handleRating(btn.key)}
            disabled={isRating}
            className={`flex flex-col items-center rounded-xl border px-2 py-2 text-sm font-medium shadow-sm transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 ${
              btn.key === 'again'
                ? 'border-danger/30 bg-danger-soft text-danger'
                : btn.key === 'hard'
                ? 'border-border-color bg-surface-sidebar text-text-primary'
                : btn.key === 'good'
                ? 'border-brand-primary bg-brand-primary-soft text-brand-primary'
                : 'border-success/30 bg-success-soft text-success'
            }`}
          >
            <span className="text-sm font-semibold">{btn.label}</span>
            {previewIntervals[btn.key] && (
              <span className="mt-0.5 text-xs opacity-80">
                {formatIntervalPreview(previewIntervals[btn.key])}
              </span>
            )}
            <span className="mt-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded bg-black/5 px-1 text-[10px] font-semibold opacity-70">
              {btn.shortcut}
            </span>
          </button>
        ))}
      </div>
    </div>
  );

  const renderAnswerDetails = (opts = {}) => (
    <VocabularyAnswerDetails
      word={currentWord}
      hideMeaning={opts.hideMeaning}
      hideClue={opts.hideClue}
    />
  );

  const renderRatingSection = () => (
    <div className="space-y-3 text-center">
      {ratingError && <Alert type="error" message={ratingError} className="text-left" />}

      {(!autoEvalEnabled || questionMode === 'flashcard' || isRated) && !isRated && renderRatingButtons()}

      {isRated && lastReviewResult && (
        <div className="rounded-lg border border-border-color bg-surface-sidebar p-3 text-center shadow-sm">
          <p className="text-sm text-text-secondary">
            Lịch ôn tập tiếp theo:{' '}
            <span className="font-semibold text-brand-primary">
              {formatReviewDue(lastReviewResult.review_due_at)}
            </span>
          </p>
          <Button
            onClick={commitProceed}
            disabled={!isReadyToProceed}
            className={`mt-3 w-full ${
              isReadyToProceed
                ? 'bg-indigo-600 opacity-100 cursor-pointer shadow-md'
                : 'bg-indigo-400 opacity-50 cursor-not-allowed pointer-events-none'
            }`}
          >
            <i className="bx bx-arrow-right text-lg"></i>
            <span>Tiếp tục · Space</span>
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col bg-surface-default text-text-primary">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-color bg-surface-sidebar px-4 py-2 shadow-sm">
        <button
          onClick={handleExit}
          className="inline-flex items-center gap-1 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
        >
          <i className="bx bx-arrow-back text-lg"></i>
          <span>Thoát</span>
        </button>
        <h2 className="truncate px-2 text-base font-semibold text-text-primary">
          {currentWord?.set_name || 'Phiên học'}
        </h2>
        <div className="flex items-center gap-2">
          <HelpButton onClick={() => setHelpOpen(true)} label="Hướng dẫn" className="px-2 py-1 text-xs" />
          <button
            onClick={() => setAutoEvalModalOpen(true)}
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${autoEvalEnabled ? 'border-brand-primary bg-brand-primary-soft text-brand-primary' : 'border-border-color bg-surface-default text-text-secondary hover:text-text-primary'}`}
            title="Chế độ tự đánh giá"
          >
            <i className={`bx ${autoEvalEnabled ? 'bx-toggle-right' : 'bx-toggle-left'} text-base`}></i>
            <span className="hidden sm:inline">Tự đánh giá</span>
          </button>
          <div className="w-16 text-right text-sm font-semibold text-text-secondary">
            {wordsRemaining > 0 && `${wordsRemaining}`}
          </div>
        </div>
      </div>

            {/* Progress Bar */}
      <div className="h-1 w-full bg-border-color">
        <div
          className="h-1 bg-brand-primary transition-all duration-300 ease-out"
          style={{ width: `${progress}%` }}
        ></div>
      </div>

      {/* Learn Mode Selector (Limited / Unlimited) */}
      <div className="flex flex-col gap-2 px-4 py-2">
        <div className="flex items-center justify-center gap-2">
          <span className="text-xs font-medium text-text-secondary">Chế độ học:</span>
          <div className="inline-flex items-center gap-1 rounded-lg border border-border-color bg-surface-default p-1 text-sm font-medium">
            <button
              onClick={() => setLearnMode('LIMITED')}
              className={`rounded-md px-3 py-1 transition-all ${
                learnMode === 'LIMITED'
                  ? 'bg-brand-primary text-white shadow'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Theo giới hạn
            </button>
            <button
              onClick={() => setLearnMode('UNLIMITED')}
              className={`rounded-md px-3 py-1 transition-all ${
                learnMode === 'UNLIMITED'
                  ? 'bg-brand-primary text-white shadow'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Không giới hạn
            </button>
          </div>
        </div>

        {/* Daily NEW info */}
        <div className="flex items-center justify-center">
          {learnMode === 'LIMITED' ? (
            <span className="text-xs text-text-secondary">
              Từ mới hôm nay: {introducedTodayCount} / {dailyNewLimit}
            </span>
          ) : (
            <span className="text-xs text-text-secondary">
              Không giới hạn từ mới • Đã học hôm nay: {introducedTodayCount}
            </span>
          )}
        </div>
      </div>

      {noWords ? (
        <div className="py-10 text-center">
          <i className="bx bx-info-circle text-3xl text-text-secondary"></i>
          <p className="mt-3 text-sm text-text-secondary">{noWords}</p>
          {(setId == null || setId === 'all') && learnMode === 'LIMITED' && (
            <p className="mt-3 text-xs text-text-secondary">
              Đã hết hạn mức từ mới hôm nay. Chuyển sang{' '}
              <span className="font-semibold text-brand-primary">Không giới hạn</span>{' '}
              để học tất cả từ mới còn lại.
            </p>
          )}
        </div>
      ) : (
      <div className="flex flex-1 flex-col items-center justify-center p-3">
        <div className={`w-full ${questionMode === 'flashcard' ? 'max-w-md' : 'max-w-2xl'} space-y-3 py-2`}>
                    {/* Status counts (small, non-intrusive) */}
          <div className="space-y-2">
            {/* Current card type indicator */}
            {currentWord && (
              <div className="flex items-center justify-center">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    currentWord.state === 'new'
                      ? 'bg-green-500/10 text-green-400'
                      : 'bg-yellow-500/10 text-yellow-400'
                  }`}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'currentColor' }} />
                  {currentWord.state === 'new' ? '🆕 Từ mới' : '🔄 Ôn tập'}
                </span>
              </div>
            )}
            <StatusCounts counts={sessionStatusCounts} />
          </div>

          {/* FLASHCARD MODE */}
          {questionMode === 'flashcard' && (
            <>
              <div
                role="button"
                tabIndex={0}
                onClick={handleFlip}
                className="relative flex min-h-[320px] w-full cursor-pointer flex-col items-center justify-center rounded-card border border-border-color bg-surface-sidebar p-8 text-center shadow-sm transition-all hover:shadow-md"
                aria-pressed={flipped}
              >
                <span className="absolute right-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-surface-hover px-2.5 py-1 text-xs font-medium text-text-secondary">
                  <i className="bx bxs-brain" aria-hidden="true"></i>
                  Flashcard
                </span>
                {!flipped ? (
                  <>
                    <p className="text-xs uppercase tracking-widest text-text-secondary">
                      Nhấn để lật thẻ · Space
                    </p>
                    <div className="mb-2 flex justify-center">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 border border-blue-200 shadow-sm">
                        📁 {currentWord?.set_name || currentWord?.setName || 'Ôn tập tổng hợp'}
                      </span>
                    </div>
                    <div className="mt-4 flex items-center gap-1">
                      <p className="text-4xl font-bold tracking-tight text-text-primary">
                        {currentWord.word}
                      </p>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          speakWord();
                        }}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-hover hover:text-brand-primary"
                        title="Phát âm từ"
                        aria-label="Phát âm từ"
                      >
                        <i className="bx bxs-volume-full text-xl"></i>
                      </button>
                    </div>
                    {currentWord.ipa && (
                      <p className="mt-1 font-mono text-base text-text-secondary">
                        /{currentWord.ipa}/
                      </p>
                    )}
                  </>
                ) : (
                  <div className="w-full">
                    <div className="mb-3 flex justify-center">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 border border-blue-200 shadow-sm">
                        📁 {currentWord?.set_name || currentWord?.setName || 'Ôn tập tổng hợp'}
                      </span>
                    </div>
                    <VocabularyAnswerDetails word={currentWord} />
                  </div>
                )}
              </div>

              {flipped && !isRated && (
                <div className="space-y-4">
                  {renderRatingSection()}
                </div>
              )}

              {isRated && renderRatingSection()}
            </>
          )}

          {/* TYPING MODE */}
          {questionMode === 'typing' && (
            <>
              {/* Question Area */}
              <div className="rounded-lg border border-border-color bg-surface-sidebar p-3 text-center shadow-sm">
                <div>
                  <div className="mb-3 flex justify-center">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 border border-blue-200 shadow-sm">
                      📁 {currentWord?.set_name || currentWord?.setName || 'Ôn tập tổng hợp'}
                    </span>
                  </div>
                  {currentWord.word_type && (
                    <span className="inline-block mb-1.5 bg-slate-100 text-slate-600 text-xs font-semibold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                      {currentWord.word_type}
                    </span>
                  )}
                  <p className="text-xs font-medium uppercase tracking-widest text-text-secondary">
                    Nghĩa tiếng Việt
                  </p>
                  <h3 className="mt-1 text-2xl font-bold tracking-tight text-text-primary">
                    {currentWord.meaning}
                  </h3>
                </div>
                {currentWord.memory_clue && (
                  <div className="mt-2 border-t border-border-color pt-2">
                    <p className="text-xs font-medium uppercase tracking-widest text-text-secondary">
                      💡 Gợi ý
                    </p>
                    <p className="mt-0.5 text-sm text-text-secondary">{currentWord.memory_clue}</p>
                  </div>
                )}
              </div>

              {/* Answer Input */}
              <div className="relative">
                <Input
                  ref={inputRef}
                  type="text"
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  placeholder="Nhập từ tiếng Anh..."
                  className="w-full rounded-xl py-2 text-center text-lg"
                  disabled={isAnswerRevealed}
                />
                {!isAnswerRevealed && (
                  <Button
                    onClick={handleSubmit}
                    className="absolute right-2 top-1/2 -translate-y-1/2"
                    size="sm"
                    disabled={!userInput.trim()}
                  >
                    Kiểm tra
                  </Button>
                )}
              </div>

              {/* Answer Feedback */}
              {isAnswerRevealed && (
                <div className="space-y-3 text-center">
                  <p
                    className={`text-lg font-bold ${
                      isCorrect ? 'text-green-500' : 'text-red-500'
                    }`}
                  >
                    {isCorrect ? '✓ Chính xác!' : '✕ Chưa chính xác'}
                  </p>

                  {!isCorrect && (
                    <p className="text-sm text-text-secondary">
                      Đáp án của bạn: <span className="font-semibold">{userInput}</span>
                    </p>
                  )}

                  {renderAnswerDetails({ hideMeaning: true, hideClue: true })}
                  <div ref={ratingRef}>{renderRatingSection()}</div>
                </div>
              )}
            </>
          )}

          {/* QUIZ MODE */}
          {questionMode === 'quiz' && currentWord && (
            <QuizExercise
              item={currentWord}
              options={quizOptions}
              onSubmitRating={(rating, _item, wasIncorrect) =>
                handleRating(rating, wasIncorrect)
              }
              ratingSection={renderRatingSection()}
              onAnswered={speakWordAndExample}
              autoEvaluationEnabled={autoEvalEnabled}
            />
          )}
        </div>
      </div>
      )}

      {/* Auto Evaluation Modal */}
      <Modal
        open={autoEvalModalOpen}
        onClose={() => setAutoEvalModalOpen(false)}
        title="Chế độ tự đánh giá"
      >
        <div className="space-y-3 text-sm text-text-secondary">
          <p>
            Khi bật chế độ này trong bài Trắc nghiệm và Gõ từ:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Trả lời sai: Hệ thống tự động đánh giá là 'Again'.</li>
            <li>Trả lời đúng: Hệ thống tự động đánh giá là 'Good'.</li>
          </ul>
          <div className="flex items-center justify-between rounded-lg border border-border-color bg-surface-default p-3">
            <span className="font-medium text-text-primary">Chế độ tự đánh giá</span>
            <button
              onClick={toggleAutoEval}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${autoEvalEnabled ? 'bg-brand-primary' : 'bg-gray-300'}`}
              aria-pressed={autoEvalEnabled}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${autoEvalEnabled ? 'translate-x-6' : 'translate-x-1'}`}
              />
            </button>
          </div>
        </div>
      </Modal>

      {/* Exit Confirmation Modal */}
      <Modal
        open={exitModalOpen}
        onClose={() => setExitModalOpen(false)}
        title="Thoát phiên học"
        footer={
          <>
            <Button variant="ghost" onClick={() => setExitModalOpen(false)}>
              Tiếp tục học
            </Button>
            <Button variant="danger" onClick={confirmExit}>
              Thoát
            </Button>
          </>
        }
      >
        <p className="text-sm text-text-secondary">
          Bạn có chắc muốn thoát phiên học này không? Các rating đã lưu vẫn được giữ lại.
        </p>
      </Modal>

      <HelpModal
        isOpen={helpOpen}
        onClose={() => setHelpOpen(false)}
        title="Mẹo luyện tập & Phím tắt nhanh"
        items={[
          { title: 'Chế độ tự đánh giá', text: 'Khi bật, câu trả lời sai tự nhận "Again", câu đúng tự nhận "Good" giúp tiết kiệm thao tác.' },
          { title: 'Phím Space', text: 'Nhấn để xem kết quả, chuyển sang từ kế tiếp hoặc nạp phiên học mới ngay lập tức.' },
          { title: 'Phím Enter', text: 'Gửi kết quả kiểm tra trong chế độ gõ từ.' },
          { title: 'Phím 1, 2, 3, 4', text: 'Đánh giá nhanh mức độ ghi nhớ khi dùng Flashcard (Again, Hard, Good, Easy).' },
        ]}
      />
    </div>
  );
};

export default LearningSession;
