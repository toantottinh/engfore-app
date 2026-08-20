import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLearningSession } from '../../hooks/useLearningSession.js';
import { ttsService } from '../../../tts.service.js';
import { formatReviewDue } from '../../utils/progress.js';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import Alert from '../../components/ui/Alert.jsx';
import StatusCounts from '../../components/ui/StatusCounts.jsx';
import VocabularyAnswerDetails from '../../components/VocabularyAnswerDetails.jsx';
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

  const {
    loading,
    error,
    ratingError,
    currentWord,
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
    restartSession,
    sessionQueueLength,
    noWords,
  } = useLearningSession(setId);

  const [exitModalOpen, setExitModalOpen] = useState(false);
  const [flipped, setFlipped] = useState(false);

  // Reset flip state khi đổi từ
  useEffect(() => {
    setFlipped(false);
  }, [currentWord?.id]);

  useEffect(() => {
    if (mode === 'typing' && !isAnswerRevealed && inputRef.current) {
      inputRef.current.focus();
    }
  }, [mode, isAnswerRevealed, currentWord]);

    const speakWord = useCallback(() => {
    if (!currentWord) return;
    try {
      ttsService.speak(currentWord.word);
    } catch (e) {
      // TTS không được hỗ trợ — không làm gián đoạn học tập
    }
  }, [currentWord]);

  // Typing: phát âm ngay trong user action submit/reveal, đúng từ hiện tại.
  const handleSubmit = useCallback(() => {
    submitAnswer();
    speakWord();
  }, [submitAnswer, speakWord]);

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
    proceedToNext();
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

  // Keyboard: Enter = submit/flip/continue, Space = lật thẻ (flashcard) /
  // continue (sau rating), 1-4 = rating. Space không bao giờ submit hoặc rating.
  useEffect(() => {
    const handler = (e) => {
      if (isSessionComplete) return;

      const el = document.activeElement;
      const isTyping =
        !!el &&
        (el.tagName === 'INPUT' ||
          el.tagName === 'TEXTAREA' ||
          el.tagName === 'SELECT' ||
          el.isContentEditable);

      // SPACE:
      //  - đang nhập liệu (input/textarea/select/contenteditable) → chèn space bình thường;
      //  - đã rating thành công → "Tiếp tục";
      //  - Flashcard đang ở mặt trước (chưa lật) → lật thẻ (tương đương click);
      //  - còn lại → chặn để không cuộn trang / kích hoạt nút ngoài ý muốn.
      if (e.key === ' ' || e.code === 'Space') {
        if (isTyping) return; // nhập space bình thường
        const canContinue = isRated && !isRating;
        if (canContinue) {
          e.preventDefault();
          commitProceed();
          return;
        }
        // Flashcard: Space = lật thẻ (như click vào vùng lật thẻ).
        if (mode === 'flashcard' && !flipped) {
          e.preventDefault();
          handleFlip();
          return;
        }
        // Ngăn Space kích hoạt nút đang focus (rating/submit/flip) hoặc cuộn trang.
        e.preventDefault();
        return;
      }

      // ENTER: submit / flip / continue
      if (e.key === 'Enter') {
        e.preventDefault();
        if (isRated) {
          commitProceed();
          return;
        }
        if (mode === 'typing' && !isAnswerRevealed) {
          handleSubmit();
          return;
        }
        if (mode === 'flashcard') {
          handleFlip();
          return;
        }
        return;
      }

      // Keys 1-4 → rating (chỉ khi reveal + chưa rating + không đang lưu)
      const revealed = mode === 'flashcard' ? flipped : isAnswerRevealed;
      if (revealed && !isRated && !isRating) {
        const idx = ['1', '2', '3', '4'].indexOf(e.key);
        if (idx >= 0) {
          e.preventDefault();
          handleRating(RATING_BUTTONS[idx].key);
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    mode, isAnswerRevealed, isRated, isRating, flipped,
    isSessionComplete, handleSubmit, handleFlip, handleRating, commitProceed,
  ]);

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
            <Button variant="secondary" onClick={restartSession}>
              <i className="bx bx-rotate-left text-lg"></i>
              <span>Học lại</span>
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
            className={`flex flex-col items-center rounded-xl border px-2 py-2.5 text-sm font-medium shadow-sm transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 ${
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
    <div className="space-y-4 text-center">
      {ratingError && <Alert type="error" message={ratingError} className="text-left" />}

      {!isRated && renderRatingButtons()}

      {isRated && lastReviewResult && (
        <div className="rounded-lg border border-border-color bg-surface-sidebar p-4 text-center shadow-sm">
          <p className="text-sm text-text-secondary">
            Lịch ôn tập tiếp theo:{' '}
            <span className="font-semibold text-brand-primary">
              {formatReviewDue(lastReviewResult.review_due_at)}
            </span>
          </p>
          <Button onClick={commitProceed} className="mt-3 w-full">
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
      <div className="flex items-center justify-between border-b border-border-color bg-surface-sidebar px-4 py-3 shadow-sm">
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
        <div className="flex w-16 items-center justify-end text-sm font-semibold text-text-secondary">
          {wordsRemaining > 0 && `${wordsRemaining}`}
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
      <div className="flex flex-col gap-3 px-4 py-3">
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

      {/* Vocabulary Stats */}
      <div className="border-b border-border-color bg-surface-sidebar px-4 py-4">
        <h3 className="mb-3 text-center text-xs font-bold uppercase tracking-wider text-text-secondary">
          Vốn từ của bạn
        </h3>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-xl font-bold text-text-primary">{formatNumber(vocabularyStats.total)}</p>
            <p className="text-xs text-text-secondary">Tổng cộng</p>
          </div>
          <div>
            <p className="text-xl font-bold text-sky-500">{formatNumber(vocabularyStats.learning)}</p>
            <p className="text-xs text-text-secondary">Đang học</p>
          </div>
          <div>
            <p className="text-xl font-bold text-green-500">{formatNumber(vocabularyStats.new)}</p>
            <p className="text-xs text-text-secondary">Từ mới</p>
          </div>
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
      <div className="flex flex-1 flex-col items-center justify-center p-4">
        <div className="w-full max-w-md space-y-5 py-4">
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
          {mode === 'flashcard' && (
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
          {mode === 'typing' && (
            <>
              {/* Question Area */}
              <div className="rounded-lg border border-border-color bg-surface-sidebar p-6 text-center shadow-sm">
                <div>
                  <p className="text-xs font-medium uppercase tracking-widest text-text-secondary">
                    Nghĩa tiếng Việt
                  </p>
                  <h3 className="mt-2 text-3xl font-bold tracking-tight text-text-primary">
                    {currentWord.meaning}
                  </h3>
                </div>
                {currentWord.memory_clue && (
                  <div className="mt-4 border-t border-border-color pt-4">
                    <p className="text-xs font-medium uppercase tracking-widest text-text-secondary">
                      💡 Gợi ý
                    </p>
                    <p className="mt-1 text-sm text-text-secondary">{currentWord.memory_clue}</p>
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
                  className="w-full rounded-xl py-3 text-center text-xl"
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
                <div className="space-y-4 text-center">
                  <p
                    className={`text-xl font-bold ${
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
                  {renderRatingSection()}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      )}

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
    </div>
  );
};

export default LearningSession;
