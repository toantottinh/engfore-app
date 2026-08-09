import React from 'react';
import { Link } from 'react-router-dom';
import { useVocabulary } from '../../hooks/useVocabulary.js';
import Spinner from '../../components/ui/Spinner.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';

/**
 * Trang chọn bộ từ để luyện tập (/practice).
 */
export default function Practice() {
  const { sets, loading } = useVocabulary();

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900">Luyện tập</h1>
        <p className="mt-1 text-sm text-zinc-500">Chọn một bộ từ để bắt đầu luyện tập.</p>
      </div>

      {sets.length === 0 ? (
        <EmptyState
          title="Bạn chưa có bộ từ vựng nào"
          description="Hãy tạo bộ từ trước khi bắt đầu luyện tập."
          action={
            <Link
              to="/vocabulary"
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              <span aria-hidden="true">+</span> Tạo bộ từ
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {sets.map((set) => (
            <div
              key={set.id}
              className="rounded-xl border border-zinc-200 bg-white p-6"
            >
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <h3 className="font-semibold text-zinc-900">{set.name}</h3>
                  <p className="mt-1 text-sm text-zinc-500">{set.word_count || 0} từ</p>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <Link
                  to={`/practice/typing/${set.id}`}
                  className="flex-1 rounded-lg bg-indigo-600 px-3 py-2 text-center text-sm font-medium text-white hover:bg-indigo-700"
                >
                  Gõ từ
                </Link>
                <Link
                  to={`/practice/flashcard/${set.id}`}
                  className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-center text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Flashcard
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
