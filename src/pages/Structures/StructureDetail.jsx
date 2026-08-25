import React, { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getStructureById } from '../../services/structure.service.js';
import { deriveStructureStatus } from '../../utils/structure-status.js';
import Button from '../../components/ui/Button.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import Alert from '../../components/ui/Alert.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';

// Emoji trạng thái học (read-only, mirror Library).
const STATUS_EMOJI = { new: '🟢', again: '🔴', review: '🟡' };

export default function StructureDetail() {
  const { structureId } = useParams();
  const [structure, setStructure] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      const { data, error: err } = await getStructureById(structureId);
      if (!active) return;
      if (err) {
        if (import.meta.env.DEV) {
          console.error('[StructureDetail] load error:', err);
        }
        setError(err?.message || 'Không tải được cấu trúc câu. Vui lòng thử lại.');
        setStructure(null);
      } else {
        setStructure(data);
      }
      setLoading(false);
    };
    load();
    return () => {
      active = false;
    };
  }, [structureId]);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (error || !structure) {
    return (
      <div className="py-6">
        <Alert type="error" message={error || 'Không tìm thấy cấu trúc câu.'} />
        <div className="mt-4">
          <Link to="/structures">
            <Button variant="secondary">← Về thư viện</Button>
          </Link>
        </div>
      </div>
    );
  }

  const { key, label } = deriveStructureStatus(structure.user_structures || null);
  const mastery = structure.user_structures?.mastery_level || 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link to="/structures" className="text-sm text-brand-primary hover:underline">
        ← Về thư viện cấu trúc
      </Link>

      <div className="rounded-xl border border-border-color bg-surface-sidebar p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">{structure.pattern}</h1>
            <p className="mt-2 text-lg text-text-secondary">{structure.meaning}</p>
          </div>
          <span className="whitespace-nowrap text-sm text-text-secondary">
            {STATUS_EMOJI[key]} {label}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-surface-hover px-2 py-0.5 text-text-secondary">
            {structure.cefr || '—'}
          </span>
          {structure.topic && (
            <span className="rounded-full bg-surface-hover px-2 py-0.5 text-text-secondary">
              {structure.topic}
            </span>
          )}
          <span className="text-text-secondary/70">Bài tập: {structure.exercise_count}</span>
          {structure.exercise_types?.length > 0 && (
            <span className="text-text-secondary/70">
              ({structure.exercise_types.join(', ')})
            </span>
          )}
        </div>

        {structure.explanation && (
          <p className="mt-4 text-sm text-text-secondary">{structure.explanation}</p>
        )}

        {mastery > 0 && (
          <p className="mt-3 text-sm text-text-secondary">Phản xạ: {mastery}/5</p>
        )}
      </div>

      {/* Examples */}
      <div className="rounded-xl border border-border-color bg-surface-sidebar p-6">
        <h2 className="mb-3 text-lg font-semibold text-text-primary">Ví dụ</h2>
        {structure.examples?.length === 0 ? (
          <p className="text-sm text-text-secondary">Chưa có ví dụ cho cấu trúc này.</p>
        ) : (
          <ul className="space-y-3">
            {structure.examples.map((ex) => (
              <li key={ex.id} className="space-y-0.5">
                <p className="text-sm font-medium text-text-primary">{ex.sentence}</p>
                {ex.translation && (
                  <p className="text-sm text-text-secondary">{ex.translation}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Học — điều hướng sang phiên học của structure này. */}
      <div className="rounded-xl border border-border-color bg-surface p-6">
        <Link to={`/structures/session/${structure.id}`}>
          <Button size="lg">Học cấu trúc này</Button>
        </Link>
      </div>
    </div>
  );
}