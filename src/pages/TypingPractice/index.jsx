import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useLearning } from '../../hooks/useLearning.js';
import { getVocabularySet } from '../../services/vocabulary.service.js';
import Button from '../../components/ui/Button.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import Alert from '../../components/ui/Alert.jsx';

export default function TypingPractice() {
  const { setId } = useParams();
  const navigate = useNavigate();
  const { loadWords, recordProgress } = useLearning();

  const [set, setSet] = useState(null);
  const [words, setWords] = useState([]);
  const [queue, setQueue] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [input, setInput] = useState('');
  const [feedback, setFeedback] = useState(null); // { status: 'correct'|'incorrect', answer }
  const [answered, setAnswered] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [stats, setStats] = useState({ correct: 0, incorrect: 0 });
  const inputRef = useRef(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError('');
      const [{ data: setData }, { data: wordData, error: wErr }] = await Promise.all([
        getVocabularySet(setId),
        loadWords(setId),
      ]);
      if (!active) return;
      setSet(setData || null);
      if (wErr) {
        setError(wErr.message || 'Không thể tải từ vựng.');
      } else {
        setWords(wordData || []);
        // Bắt đầu từ từ đầu, xáo trộn nhẹ
        const shuffled = shuffle([...(wordData || [])]);
        setQueue(shuffled);
      }
      setLoading(false);
      setLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, [setId]);

  const current = queue[currentIndex];

  // CHỈ khi người dùng thực sự submit đáp án (bấm "Kiểm tra" hoặc Enter).
  const handleSubmitAnswer = async (e) => {
    e.preventDefault();
    if (!current || answered) return;

    const userAnswer = input.trim();
    const isCorrect =
      userAnswer.toLowerCase() === (current.word || '').toLowerCase();

    setFeedback({
      status: isCorrect ? 'correct' : 'incorrect',
      answer: current.word,
    });
    setAnswered(true);

    await recordProgress(current.id, { correct: isCorrect });

    setStats((s) => ({
      correct: s.correct + (isCorrect ? 1 : 0),
      incorrect: s.incorrect + (isCorrect ? 0 : 1),
    }));
  };

  // Enter trong ô nhập: nếu CHƯA trả lời → gửi qua form handleSubmitAnswer;
  // nếu ĐÃ trả lời → chuyển sang từ tiếp theo (không gọi lại checkAnswer).
  const handleInputKeyDown = (e) => {
    if (e.key === 'Enter' && answered) {
      e.preventDefault();
      handleNextWord();
    }
  };

  // CHỈ chuyển sang từ kế tiếp + reset trạng thái câu hỏi.
  // KHÔNG gọi checkAnswer() ở đây.
  const handleNextWord = () => {
    setInput('');
    setFeedback(null);
    setAnswered(false);
    setCurrentIndex((i) => i + 1);
  };

  // Mỗi khi sang câu mới: bảo đảm focus vào ô nhập (vì autoFocus chỉ chạy 1 lần
  // khi mount, không tự chạy lại khi currentIndex đổi).
  useEffect(() => {
    if (currentIndex >= queue.length) return;
    inputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  const restart = () => {
    setInput('');
    setFeedback(null);
    setAnswered(false);
    setCurrentIndex(0);
    setStats({ correct: 0, incorrect: 0 });
    setQueue(shuffle([...words]));
  };

  if (loading) return <Spinner />;

  if (error || !set) {
    return (
      <div className="py-10">
        <Alert type="error" message={error || 'Không tìm thấy bộ từ.'} />
        <div className="mt-4">
          <Button variant="secondary" onClick={() => navigate('/vocabulary')}>
            Quay lại từ vựng
          </Button>
        </div>
      </div>
    );
  }

  // Kết thúc phiên
  if (currentIndex >= queue.length) {
    return (
      <div className="mx-auto max-w-lg py-10">
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-2xl">
            ✅
          </div>
          <h2 className="mt-4 text-2xl font-bold text-zinc-900">Hoàn thành!</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Bạn đã hoàn thành bộ từ <strong>{set.name}</strong>
          </p>
          <div className="mt-6 grid grid-cols-2 gap-4">
            <div className="rounded-xl bg-green-50 p-4">
              <p className="text-2xl font-bold text-green-700">{stats.correct}</p>
              <p className="text-sm text-green-600">Chính xác</p>
            </div>
            <div className="rounded-xl bg-red-50 p-4">
              <p className="text-2xl font-bold text-red-600">{stats.incorrect}</p>
              <p className="text-sm text-red-500">Chưa đúng</p>
            </div>
          </div>
          <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
            <Button onClick={restart} variant="secondary">
              Luyện lại
            </Button>
            <Link
              to={`/vocabulary/${setId}`}
              className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Về bộ từ
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">Chế độ gõ từ</h1>
          <p className="text-sm text-zinc-500">{set.name}</p>
        </div>
        <Link
          to={`/vocabulary/${setId}`}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Thoát
        </Link>
      </div>

      {/* Thanh tiến trình */}
      <div className="mb-6">
        <div className="mb-1 flex justify-between text-xs text-zinc-500">
          <span>
            Từ {currentIndex + 1}/{queue.length}
          </span>
          <span>
            Đúng {stats.correct} · Sai {stats.incorrect}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200">
          <div
            className="h-full rounded-full bg-indigo-600 transition-all"
            style={{ width: `${((currentIndex + 1) / queue.length) * 100}%` }}
          />
        </div>
      </div>

      {current && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-8">
          {/* Hiển thị nghĩa tiếng Việt */}
          <div className="text-center">
            <p className="text-xs uppercase tracking-wide text-zinc-400">
              Gõ từ tiếng Anh cho nghĩa sau
            </p>
            <p className="mt-3 text-3xl font-bold text-zinc-900">{current.meaning}</p>
            {current.word_type && (
              <p className="mt-1 text-sm text-zinc-500">
                {wordTypeLabel(current.word_type)}
              </p>
            )}
          </div>

          <form onSubmit={handleSubmitAnswer} className="mt-8 space-y-4">
            {/* key={currentIndex} đảm bảo input được remount mỗi khi sang từ mới,
                nên ô nhập luôn trống và sẵn sàng gõ (KHÔNG dính giá trị cũ). */}
            <input
              key={currentIndex}
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleInputKeyDown}
              readOnly={answered}
              placeholder="Nhập từ tiếng Anh..."
              autoComplete="off"
              autoCapitalize="off"
              spellCheck="false"
              className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-center text-xl text-zinc-900 placeholder:text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 read-only:bg-zinc-50"
            />

            {/* Phản hồi */}
            {feedback && (
              <div
                className={`rounded-lg px-4 py-3 text-center text-sm font-medium ${
                  feedback.status === 'correct'
                    ? 'bg-green-50 text-green-700'
                    : 'bg-red-50 text-red-700'
                }`}
              >
                {feedback.status === 'correct'
                  ? 'Chính xác!'
                  : `Chưa chính xác. Đáp án đúng: ${feedback.answer}`}
              </div>
            )}

            {!answered ? (
              <Button type="submit" size="lg" className="w-full">
                Kiểm tra
              </Button>
            ) : (
              <Button type="button" size="lg" className="w-full" onClick={handleNextWord}>
                {currentIndex + 1 >= queue.length ? 'Kết thúc' : 'Từ tiếp theo'}
              </Button>
            )}
          </form>
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

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
