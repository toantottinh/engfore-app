import React from 'react';

/**
 * Compact status counts pill row for learning sessions.
 * Green = New, Red = Wrong/Again, Yellow = Review.
 * Small, readable, non-intrusive — not a big card.
 */
export default function StatusCounts({ counts }) {
  const items = [
    { key: 'new', label: 'Mới', cls: 'status-pill--new' },
    { key: 'again', label: 'Again', cls: 'status-pill--again' },
    { key: 'review', label: 'Ôn', cls: 'status-pill--review' },
  ];
  return (
    <div className="flex items-center justify-center gap-4">
      {items.map(({ key, label, cls }) => (
        <span key={key} className={`status-pill ${cls}`}>
          <span className="dot" aria-hidden="true" />
          <strong>{counts?.[key] ?? 0}</strong>
          {label}
        </span>
      ))}
    </div>
  );
}
