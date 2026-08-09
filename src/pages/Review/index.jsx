 import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.jsx';
import {
  getDueReviewWords,
  getDueReviewWordsCount,
  recordLearningResult,
} from '../../services/learning.service.js';
import Button from '../../components/ui/Button.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import Alert from '../../components/ui/Alert.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { getAuthErrorMessage } from '../../utils/auth-errors.js';

const MAX_DUE = 50;

/**
 * Feature 2 — SRS Review (Ôn tập cách quãng).
 * Thu thập các từ đến hạn (review_due_at <= now), cho ôn theo chế độ
 * Gõ từ hoặc Flashcard. Kết quả mỗi từ được lưu qua `recordLearningResult`
 * (single source of truth trong learning.service.js) — logic mastery/interval
 * thống nhất với Flashcard và Typing.
 */
export default function Review() {
  const { user } = useAuth();

  const [phase, setPhase] = useState('loading'); // loading | intro | session | complete | error
  const [mode, setMode] = useState('typing'); // typing | flashcard

  const [words, setWords] = useState([]);
  const [dueCount, setDueCount] = useState(0);
  const [queue, setQueue] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState([]);

  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // ---- Load số từ đến hạn + danh sách ----
  const load = useCallback(async () => {
    if (!user) return;
    setPhase('loading');
    setError('');
    const [countRes, wordsRes] = await Promise.all([
      getDueReviewWordsCount(user.id),
      getDueReviewWords(user.id, MAX_DUE),
    ]);
    if (countRes.error || wordsRes.error) {
      setError(
        getAuthErrorMessage(countRes.error || wordsRes.error) ||
          'Không thể tải danh sách từ ôn tập.'
      );
      setPhase('error');
      return;
    }
    setDueCount(countRes.count ?? 0);
    setWords(wordsRes.data || []);
    setPhase((wordsRes.data || []).length > 0 ? 'intro' : 'complete');
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  // ---- Bắt đầu phiên ----
  const startSession = () => {
    setQueue(shuffle([...words]));
    setCurrentIndex(0);
    setResults([]);
    setSaveError('');
    setPhase('session');
  };

const current = queue[currentIndex];
  const isDone = currentIndex >= queue.length;

// ---- Hoàn thành phiên -> lưu SRS (gọi recordLearningResult cho từng kết quả) ----
  const finishSession = async () => {
    setSaving(true);
    setSaveError('');
    // Lưu tuần tự từng kết quả qua single source of truth.
    for (const r of results) {
      const { error: err } = await recordLearningResult({
        userId: user.id,
        wordSenseId: r.word_sense_id,
        correct: r.correct,
      });
      if (err) {
        setSaving(false);
        setSaveError(getAuthErrorMessage(err) || 'Không thể lưu tiến trình ôn tập.');
        return;
      }
    }
    setSaving(false);
    setPhase('complete');
  };

  // ---- Tự động lưu kết quả khi duyệt hết toàn bộ từ ----
  // Hook phải đặt ở đây (trước mọi early return) để tuân thủ Rules of Hooks.
  useEffect(() => {
    if (phase === 'session' && isDone && results.length > 0 && !saving) {
      finishSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, isDone, results.length, saving]);

// ---- Ghi nhận kết quả cho từ hiện tại (gọi từ từng chế độ) ----
  const recordResult = async (wordSenseId, correct) => {
    setResults((prev) => [...prev, { word_sense_id: wordSenseId, correct: !!correct }]);
  };

  const nextWord = () => {
    setCurrentIndex((i) => i + 1);
  };

  // Kết quả thống kê cho màn hoàn thành
  const correctCount = results.filter((r) => r.correct).length;

  // ---------------- RENDER ----------------
  if (phase === 'loading') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="py-10">
        <Alert type="error" message={error || 'Đã xảy ra lỗi. Vui lòng thử lại.'} />
        <div className="mt-4">
          <Button variant="secondary" onClick={load}>
            Thử lại
          </Button>
        </div>
      </div>
    );
  }

// Empty state — không có từ đến hạn
  if ((phase === 'complete' && words.length === 0) || dueCount === 0) {
    return (
      <EmptyState
        title="🎉 Bạn đã hoàn thành tất cả bài ôn hôm nay!"
        description="Không còn từ nào đến hạn ôn tập. Hãy luyện tập thêm để từ mới xuất hiện trong hàng đợi ôn tập."
        action={
          <Link
            to="/practice"
            className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Luyện tập
          </Link>
        }
      />
    );
  }

  // Intro — chọn chế độ và bắt đầu
  if (phase === 'intro') {
    return (
      <div className="mx-auto max-w-lg py-10">
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-indigo-100 text-2xl">
            🔄
          </div>
          <h1 className="mt-4 text-2xl font-bold text-zinc-900">Ôn tập</h1>
<p className="mt-2 text-sm text-zinc-500">
            Bạn có{' '}
            <strong className="text-indigo-600">{dueWordLabel(dueCount, words.length)}</strong>{' '}
            cần ôn tập hôm nay. Hãy dành vài phút để ghi nhớ lâu dài.
          </p>

          <div className="mt-6 text-left">
            <p className="mb-2 text-sm font-medium text-zinc-700">Chọn chế độ ôn tập</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setMode('typing')}
                className={`rounded-lg border px-4 py-3 text-sm font-medium transition-colors ${
                  mode === 'typing'
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                    : 'border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50'
                }`}
              >
                ⌨️ Gõ từ
              </button>
              <button
                onClick={() => setMode('flashcard')}
                className={`rounded-lg border px-4 py-3 text-sm font-medium transition-colors ${
                  mode === 'flashcard'
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                    : 'border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50'
                }`}
              >
                🃏 Flashcard
              </button>
            </div>
          </div>

          <Button size="lg" className="mt-6 w-full" onClick={startSession}>
            Bắt đầu ôn tập
          </Button>
          <div className="mt-3">
            <Link to="/app" className="text-sm font-medium text-zinc-500 hover:text-zinc-700">
              Về trang chủ
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Hoàn thành — hiển thị kết quả
  if (phase === 'complete') {
    return (
      <div className="mx-auto max-w-lg py-10">
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-2xl">
            🎉
          </div>
          <h2 className="mt-4 text-2xl font-bold text-zinc-900">Hoàn thành phiên ôn tập!</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Bạn đã ôn tập {results.length} từ. Tiến trình đã được lưu.
          </p>

          <div className="mt-6 grid grid-cols-2 gap-4">
            <div className="rounded-xl bg-green-50 p-4">
              <p className="text-2xl font-bold text-green-700">{correctCount}</p>
              <p className="text-sm text-green-600">Trả lời đúng</p>
            </div>
            <div className="rounded-xl bg-red-50 p-4">
              <p className="text-2xl font-bold text-red-600">{results.length - correctCount}</p>
              <p className="text-sm text-red-500">Chưa chính xác</p>
            </div>
          </div>

          {saveError && <Alert type="error" message={saveError} className="mt-4" />}

          <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
            <Button onClick={startSession} variant="secondary">
              Ôn lại
            </Button>
            <Link
              to="/app"
              className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Về trang chủ
            </Link>
          </div>
        </div>
      </div>
    );
  }

// ---------------- SESSION ----------------
  // Đang lưu kết quả sau khi hết từ
  if (isDone && phase === 'session') {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center">
          <Spinner />
          <p className="mt-3 text-sm text-zinc-500">Đang lưu kết quả ôn tập...</p>
        </div>
      </div>
    );
  }

  const progress = currentIndex; // đã ghi nhận kết quả cho từ trước, index trỏ tới từ kế

  return (
    <div className="mx-auto max-w-lg py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">Ôn tập</h1>
          <p className="text-sm text-zinc-500">
            {mode === 'typing' ? 'Chế độ gõ từ' : 'Chế độ flashcard'}
          </p>
        </div>
        <Link
          to="/app"
          className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Thoát
        </Link>
      </div>

      {/* Thanh tiến trình */}
      <div className="mb-6">
        <div className="mb-1 flex justify-between text-xs text-zinc-500">
          <span>
            Từ {Math.min(progress + 1, results.length || 1)}/{queue.length}
          </span>
          <span>Đúng {correctCount}</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200">
          <div
            className="h-full rounded-full bg-indigo-600 transition-all"
            style={{
              width: `${queue.length ? ((Math.min(progress + 1, results.length || 1)) / queue.length) * 100 : 0}%`,
            }}
          />
        </div>
      </div>

      {current ? (
        mode === 'typing' ? (
          <TypingCard key={current.id} word={current} onResult={recordResult} onNext={nextWord} />
        ) : (
          <FlashcardCard key={current.id} word={current} onResult={recordResult} onNext={nextWord} />
        )
      ) : null}

      {saveError && <Alert type="error" message={saveError} className="mt-4" />}
    </div>
  );
}

/**
 * Thẻ gõ từ: hiện nghĩa tiếng Việt, người dùng nhập từ tiếng Anh.
 * Mỗi từ 1 lần thử -> correct nếu đúng, incorrect nếu sai.
 */
function TypingCard({ word, onResult, onNext }) {
  const [input, setInput] = useState('');
  const [answered, setAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);

const handleSubmit = (e) => {
    e.preventDefault();
    if (answered) return;
    const correct = input.trim().toLowerCase() === (word.word || '').toLowerCase();
    setIsCorrect(correct);
    setAnswered(true);
    onResult(word.id, correct);
  };

  const handleNext = () => {
    onNext();
  };

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-8">
      <div className="text-center">
        <p className="text-xs uppercase tracking-wide text-zinc-400">
          Gõ từ tiếng Anh cho nghĩa sau
        </p>
        <p className="mt-3 text-3xl font-bold text-zinc-900">{word.meaning}</p>
        {word.word_type && (
          <p className="mt-1 text-sm text-zinc-500">{wordTypeLabel(word.word_type)}</p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={answered}
          placeholder="Nhập từ tiếng Anh..."
          autoFocus
          autoComplete="off"
          autoCapitalize="off"
          spellCheck="false"
          className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-center text-xl text-zinc-900 placeholder:text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-zinc-50"
        />

        {answered && (
          <div
            className={`rounded-lg px-4 py-3 text-center text-sm font-medium ${
              isCorrect ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            }`}
          >
            {isCorrect ? 'Chính xác!' : `Chưa chính xác. Đáp án đúng: ${word.word}`}
          </div>
        )}

        {!answered ? (
          <Button type="submit" size="lg" className="w-full">
            Kiểm tra
          </Button>
        ) : (
          <Button type="button" size="lg" className="w-full" onClick={handleNext}>
            Từ tiếp theo
          </Button>
        )}
      </form>
    </div>
  );
}

/**
 * Thẻ flashcard: lật thẻ để xem nghĩa, đánh giá mức nhớ (recall 0/1/2/3).
 * Điều kiện correct: recall >= 2 ("Nhớ"/"Rất dễ") -> correct;
 * recall < 2 ("Chưa nhớ"/"Khó") -> incorrect.
 * Logic mastery/interval do learning.service.js xử lý tập trung.
 */
function FlashcardCard({ word, onResult, onNext }) {
  const [flipped, setFlipped] = useState(false);
  const [rated, setRated] = useState(false);

  const flip = () => {
    if (!rated) setFlipped((f) => !f);
  };

  const rate = (recall) => {
    const correct = recall >= 2;
    onResult(word.id, correct);
    setRated(true);
  };

  return (
    <div>
      <button
        onClick={flip}
        className="flex min-h-[260px] w-full flex-col items-center justify-center rounded-2xl border-2 border-indigo-200 bg-white p-8 text-center transition-colors hover:border-indigo-300"
        aria-pressed={flipped}
      >
        {!flipped ? (
          <>
            <p className="text-xs uppercase tracking-wide text-zinc-400">Nhấn để lật thẻ</p>
            <p className="mt-3 text-4xl font-bold text-zinc-900">{word.word}</p>
            {word.word_type && (
              <p className="mt-2 text-sm text-zinc-500">{wordTypeLabel(word.word_type)}</p>
            )}
          </>
        ) : (
          <div className="w-full">
            <p className="text-xl font-semibold text-zinc-900">{word.word}</p>
            {word.ipa && <p className="mt-1 text-indigo-600">/{word.ipa}/</p>}
            <div className="mx-auto mt-4 max-w-sm rounded-lg bg-indigo-50 p-4">
              <p className="text-lg font-medium text-indigo-900">{word.meaning}</p>
            </div>
            {word.example && (
              <p className="mt-3 text-sm italic text-zinc-500">"{word.example}"</p>
            )}
          </div>
        )}
      </button>

      {flipped && !rated && (
        <div className="mt-4">
          <p className="mb-2 text-center text-sm text-zinc-500">Bạn nhớ từ này thế nào?</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <button
              onClick={() => rate(0)}
              className="rounded-lg bg-red-100 px-3 py-2.5 text-sm font-medium text-red-700 hover:bg-red-200"
            >
              Chưa nhớ
            </button>
            <button
              onClick={() => rate(1)}
              className="rounded-lg bg-amber-100 px-3 py-2.5 text-sm font-medium text-amber-700 hover:bg-amber-200"
            >
              Khó
            </button>
            <button
              onClick={() => rate(2)}
              className="rounded-lg bg-green-100 px-3 py-2.5 text-sm font-medium text-green-700 hover:bg-green-200"
            >
              Nhớ
            </button>
            <button
              onClick={() => rate(3)}
              className="rounded-lg bg-indigo-100 px-3 py-2.5 text-sm font-medium text-indigo-700 hover:bg-indigo-200"
            >
              Rất dễ
            </button>
          </div>
        </div>
      )}

      {rated && (
        <div className="mt-4">
          <Button size="lg" className="w-full" onClick={onNext}>
            Từ tiếp theo
          </Button>
        </div>
      )}
    </div>
  );
}

function wordTypeLabel(type) {
  const map = {
    noun: 'Danh từ',
    verb: 'Động từ',
    adjective: 'Tính từ',
    adverb: 'Trạng từ',
    preposition: 'Giới từ',
    conjunction: 'Liên từ',
    pronoun: 'Đại từ',
    other: 'Khác',
  };
  return map[type] || type || '';
}

/** Trả về câu thông báo số từ: dùng dueCount, nhưng nếu words.length < dueCount do giới hạn thì ghi chú. */
function dueWordLabel(dueCount, loaded) {
  if (loaded >= dueCount) {
    return dueCount === 1 ? '1 từ' : `${dueCount} từ`;
  }
  return `${loaded} từ (trong ${dueCount} từ đến hạn)`;
}

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

