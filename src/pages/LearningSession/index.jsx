import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useLearningSession } from '../../hooks/useLearningSession.js';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import Alert from '../../components/ui/Alert.jsx';
import { cefrBadgeClass, cefrLabel } from '../../utils/cefr.js';

const LearningSession = () => {
  const { setId } = useParams();
  const navigate = useNavigate();
  const inputRef = useRef(null);

  const {
    loading,
    error,
    currentWord,
    userInput,
    isAnswerRevealed,
    isCorrect,
    isSessionComplete,
    progress,
    wordsRemaining,
    stats,
    setUserInput,
    submitAnswer,
    handleRating,
    restartSession,
    sessionQueueLength,
  } = useLearningSession(setId);

  const [exitModalOpen, setExitModalOpen] = useState(false);

  useEffect(() => {
    if (!isAnswerRevealed && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isAnswerRevealed, currentWord]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (!isAnswerRevealed) {
        submitAnswer();
      } else {
        // Nếu đã reveal đáp án, Enter sẽ chọn "Good" và chuyển sang từ tiếp theo
        handleRating('good');
      }
    }
  };

  const handleExit = () => {
    setExitModalOpen(true);
  };

  const confirmExit = () => {
    navigate(`/vocabulary/${setId}`);
  };

  if (loading) {
    return <Spinner />;
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Alert type="error" message={error} className="max-w-md" />
        <div className="mt-4 text-center">
          <Button onClick={() => navigate(`/vocabulary/${setId}`)}>
            Về bộ từ
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
            <Button onClick={() => navigate(`/vocabulary/${setId}`)}>
              <i className="bx bx-folder-open text-lg"></i>
              <span>Về bộ từ</span>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!currentWord) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Alert type="info" message="Không có từ nào trong bộ từ này để học." className="max-w-md" />
        <div className="mt-4 text-center">
          <Button onClick={() => navigate(`/vocabulary/${setId}`)}>
            Về bộ từ
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-surface-default text-text-primary">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-color bg-surface-sidebar px-4 py-3 shadow-sm">
        <button
          onClick={handleExit}
          className="inline-flex items-center gap-1 text-sm font-medium text-text-secondary hover:text-text-primary"
        >
          <i className="bx bx-arrow-back text-lg"></i>
          <span>Thoát</span>
        </button>
        <h2 className="text-base font-semibold text-text-primary">
          {currentWord.set_name || 'Phiên học'}
        </h2>
        <div className="w-16"></div> {/* Placeholder for balance */}
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-border-color">
        <div
          className="h-1 bg-brand-primary transition-all duration-300 ease-out"
          style={{ width: `${progress}%` }}
        ></div>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6">
          {/* Question Area */}
          <div className="rounded-lg border border-border-color bg-surface-sidebar p-6 text-center shadow-md">
            <p className="text-sm text-text-secondary">Nghĩa tiếng Việt</p>
            <h3 className="mt-2 text-3xl font-bold text-text-primary">
              {currentWord.meaning}
            </h3>
          </div>

          {/* Answer Input */}
          <div className="relative">
            <Input
              ref={inputRef}
              type="text"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Nhập từ tiếng Anh..."
              className="w-full text-center text-lg"
              disabled={isAnswerRevealed}
            />
            {!isAnswerRevealed && (
              <Button
                onClick={submitAnswer}
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

              <div className="rounded-lg border border-border-color bg-surface-sidebar p-4 text-left shadow-sm">
                <div className="flex items-center gap-2">
                  <button className="text-text-secondary hover:text-brand-primary">
                    <i className="bx bxs-volume-full text-lg"></i>
                  </button>
                  <span className="text-2xl font-bold text-text-primary">
                    {currentWord.word}
                  </span>
                </div>
                {currentWord.ipa && (
                  <p className="font-mono text-sm text-text-secondary">
                    /{currentWord.ipa}/
                  </p>
                )}
                <p className="mt-2 text-sm text-text-secondary">
                  Loại từ:{' '}
                  <span className="font-medium uppercase">
                    {currentWord.word_type.replace(/_/g, ' ')}
                  </span>
                </p>
                <p className="mt-1 text-sm text-text-secondary">
                  Cấp độ CEFR:{' '}
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-bold ${cefrBadgeClass(
                      currentWord.cefr_level
                    )}`}
                  >
                    {cefrLabel(currentWord.cefr_level)}
                  </span>
                </p>
                {currentWord.example && (
                  <p className="mt-2 text-sm italic text-text-secondary">
                    Ví dụ: "{currentWord.example}"
                  </p>
                )}
              </div>

              {/* Rating Buttons */}
              <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
                <Button
                  variant="danger"
                  onClick={() => handleRating('again')}
                  className="flex-1"
                >
                  Again
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => handleRating('hard')}
                  className="flex-1"
                >
                  Hard
                </Button>
                <Button
                  variant="primary"
                  onClick={() => handleRating('good')}
                  className="flex-1"
                >
                  Good
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

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
          Bạn có chắc muốn thoát phiên học này không? Tiến độ hiện tại sẽ không được lưu.
        </p>
      </Modal>
    </div>
  );
};

export default LearningSession;