import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.jsx';
import { useVocabulary } from '../../hooks/useVocabulary.js';
import Button from '../../components/ui/Button.jsx';
import Spinner from '../../components/ui/Spinner.jsx';

export default function App() {
  const { user, profile } = useAuth();
  const { sets, loading } = useVocabulary();

  const totalWords = sets.reduce((sum, s) => sum + (s.word_count || 0), 0);
  const firstName = profile?.username || user?.email?.split('@')[0] || 'bạn';

  return (
    <div>
      <div className="mb-8">
        <p className="text-lg text-zinc-500">Chào mừng trở lại 👋</p>
        <h1 className="text-2xl font-bold text-zinc-900">{firstName}</h1>
      </div>

      {/* Thống kê nhanh */}
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <p className="text-sm text-zinc-500">Bộ từ</p>
          <p className="mt-1 text-3xl font-bold text-zinc-900">{sets.length}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <p className="text-sm text-zinc-500">Từ vựng</p>
          <p className="mt-1 text-3xl font-bold text-zinc-900">{totalWords}</p>
        </div>
        <div className="rounded-xl border border-indigo-600 bg-indigo-600 p-5 text-white">
          <p className="text-sm text-indigo-100">Mẹo học</p>
          <p className="mt-1 text-sm font-medium leading-relaxed">
            Luyện tập 10 phút mỗi ngày sẽ giúp bạn nhớ từ lâu hơn.
          </p>
        </div>
      </div>

      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-900">Bắt đầu học</h2>
        <Link to="/vocabulary" className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
          Xem tất cả
        </Link>
      </div>

      {loading ? (
        <Spinner />
      ) : sets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-10 text-center">
          <p className="text-zinc-600">Bạn chưa có bộ từ vựng nào.</p>
          <div className="mt-4">
            <Link
              to="/vocabulary"
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              <span aria-hidden="true">+</span> Tạo bộ từ đầu tiên
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sets.slice(0, 6).map((set) => (
            <div
              key={set.id}
              className="flex flex-col rounded-xl border border-zinc-200 bg-white p-5"
            >
              <Link
                to={`/vocabulary/${set.id}`}
                className="text-base font-semibold text-zinc-900 hover:text-indigo-600"
              >
                {set.name}
              </Link>
              {set.description && (
                <p className="mt-1 line-clamp-2 text-sm text-zinc-500">{set.description}</p>
              )}
              <p className="mt-2 text-xs text-zinc-500">{set.word_count || 0} từ</p>
              <div className="mt-3 flex gap-2">
                <Link
                  to={`/practice/typing/${set.id}`}
                  className="flex-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-center text-sm font-medium text-white hover:bg-indigo-700"
                >
                  Gõ từ
                </Link>
                <Link
                  to={`/practice/flashcard/${set.id}`}
                  className="flex-1 rounded-lg border border-zinc-300 px-3 py-1.5 text-center text-sm font-medium text-zinc-700 hover:bg-zinc-50"
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
