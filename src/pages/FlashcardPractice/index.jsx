import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useLearning } from '../../hooks/useLearning.js';
import { getVocabularySet } from '../../services/vocabulary.service.js';
import Button from '../../components/ui/Button.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import Alert from '../../components/ui/Alert.jsx';

export default function FlashcardPractice() {
  const { setId } = useParams();
  const navigate = useNavigate();
  const { loadWords, recordProgress } = useLearning();

  const [set, setSet] = useState(null);
  const [queue, setQueue] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [flipped, setFlipped] = useState(false);
  const [rated, setRated] = useState(false);
  const [stats, setStats] = useState({ remembered: 0, total: 0 });

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
        setQueue(shuffle([...(wordData || [])]));
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [setId]);

  const current = queue[currentIndex];

  const flip = () => {
    if (!rated) setFlipped((f) => !f);
  };

const rate = async (recall) => {
    if (!current) return;
    // recall >= 2 ("Nhớ"/"Rất dễ") -> correct; recall < 2 ("Chưa nhớ"/"Khó") -> incorrect.
    // Logic mastery/interval được xử lý tập trung trong learning.service.js.
    const correct = recall >= 2;
    await recordProgress(current.id, { correct });
    setStats((s) => ({
      remembered: s.remembered + (correct ? 1 : 0),
      total: s.total + 1,
    }));
    setRated(true);
  };

  const next = useCallback(() => {
    setFlipped(false);
    setRated(false);
    setCurrentIndex((i) => i + 1);
  }, []);

  // Nhấn Enter khi đã đánh giá xong → chuyển sang thẻ tiếp theo cho tiện.
  useEffect(() => {
    if (!rated) return;
    const onKey = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        next();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [rated, next]);

  const restart = () => {
    setFlipped(false);
    setRated(false);
    setCurrentIndex(0);
    setStats({ remembered: 0, total: 0 });
    setQueue(shuffle([...queue]));
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

  if (currentIndex >= queue.length) {
    return (
      <div className="mx-auto max-w-lg py-10">
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-2xl">
            🎉
          </div>
          <h2 className="mt-4 text-2xl font-bold text-zinc-900">Hoàn thành!</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Bạn đã luyện tập xong bộ từ <strong>{set.name}</strong>
          </p>
          <div className="mt-6 grid grid-cols-2 gap-4">
            <div className="rounded-xl bg-green-50 p-4">
              <p className="text-2xl font-bold text-green-700">{stats.remembered}</p>
              <p className="text-sm text-green-600">Nhớ</p>
            </div>
            <div className="rounded-xl bg-zinc-50 p-4">
              <p className="text-2xl font-bold text-zinc-700">{stats.total}</p>
              <p className="text-sm text-zinc-500">Tổng</p>
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
          <h1 className="text-xl font-bold text-zinc-900">Thẻ ghi nhớ</h1>
          <p className="text-sm text-zinc-500">{set.name}</p>
        </div>
        <Link
          to={`/vocabulary/${setId}`}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Thoát
        </Link>
      </div>

      <div className="mb-6">
        <div className="mb-1 flex justify-between text-xs text-zinc-500">
          <span>
            Thẻ {currentIndex + 1}/{queue.length}
          </span>
          <span>Nhớ {stats.remembered}</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200">
          <div
            className="h-full rounded-full bg-indigo-600 transition-all"
            style={{ width: `${((currentIndex + 1) / queue.length) * 100}%` }}
          />
        </div>
      </div>

      {current && (
        <div>
          {/* Thẻ */}
          <button
            onClick={flip}
            className="flex min-h-[260px] w-full flex-col items-center justify-center rounded-2xl border-2 border-indigo-200 bg-white p-8 text-center transition-colors hover:border-indigo-300"
            aria-pressed={flipped}
          >
            {!flipped ? (
              <>
                <p className="text-xs uppercase tracking-wide text-zinc-400">
                  Nhấn để lật thẻ
                </p>
                <p className="mt-3 text-4xl font-bold text-zinc-900">{current.word}</p>
                {current.word_type && (
                  <p className="mt-2 text-sm text-zinc-500">
                    {wordTypeLabel(current.word_type)}
                  </p>
                )}
              </>
            ) : (
              <div className="w-full">
                <p className="text-xl font-semibold text-zinc-900">{current.word}</p>
                {current.ipa && (
                  <p className="mt-1 text-indigo-600">/{current.ipa}/</p>
                )}
                <div className="mx-auto mt-4 max-w-sm rounded-lg bg-indigo-50 p-4">
                  <p className="text-lg font-medium text-indigo-900">{current.meaning}</p>
                </div>
                {current.example && (
                  <p className="mt-3 text-sm italic text-zinc-500">"{current.example}"</p>
                )}
              </div>
            )}
          </button>

          {/* Đánh giá mức nhớ */}
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
              <Button size="lg" className="w-full" onClick={next}>
                {currentIndex + 1 >= queue.length ? 'Kết thúc' : 'Thẻ tiếp theo'}
              </Button>
            </div>
          )}
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
