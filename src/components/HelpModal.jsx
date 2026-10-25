import React, { useEffect } from 'react';

function normalizeEntry(entry) {
  if (entry == null) return null;
  if (typeof entry === 'string') return { text: entry };
  return entry;
}

function EntryBody({ entry }) {
  const title = entry.title || entry.label;
  const text = entry.text || entry.description || entry.content;
  const bullets = entry.bullets || entry.items || entry.children;
  return (
    <div className="space-y-1">
      {title && <p className="font-semibold text-text-primary">{title}</p>}
      {text && <p className="text-sm leading-relaxed text-text-secondary">{text}</p>}
      {Array.isArray(bullets) && bullets.length > 0 && (
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-relaxed text-text-secondary">
          {bullets.map((b, i) => (
            <li key={i}>{typeof b === 'string' ? b : b?.text || b?.label || ''}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function HelpButton({ onClick, label = 'Hướng dẫn', className = '' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900 ${className}`}
    >
      <span aria-hidden="true">💡</span>
      {label}
    </button>
  );
}

export default function HelpModal({ isOpen, onClose, title, steps, items }) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const list = steps || items;
  const isSteps = Boolean(steps);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="w-full max-w-2xl rounded-2xl bg-surface-sidebar shadow-2xl">
        <div className="flex items-center justify-between border-b border-border-color px-5 py-4">
          <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-text-secondary hover:bg-surface-hover hover:text-text-primary"
            aria-label="Đóng"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto px-5 py-4">
          {isSteps ? (
            <ol className="space-y-3">
              {(list || []).map((entry, idx) => {
                const e = normalizeEntry(entry);
                if (!e) return null;
                return (
                  <li key={idx} className="flex gap-3">
                    <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-brand-primary text-sm font-bold text-white">
                      {idx + 1}
                    </span>
                    <div className="flex-1 pt-0.5">
                      <EntryBody entry={e} />
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <ul className="space-y-3">
              {(list || []).map((entry, idx) => {
                const e = normalizeEntry(entry);
                if (!e) return null;
                return (
                  <li key={idx} className="rounded-xl border border-border-color bg-surface-default p-4">
                    <EntryBody entry={e} />
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}