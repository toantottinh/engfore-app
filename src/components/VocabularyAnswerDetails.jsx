import React from 'react';
import { cefrBadgeClass, cefrLabel } from '../utils/cefr.js';
import { ttsService } from '../../tts.service.js';

/**
 * Shared revealed-answer card for learning, review, and practice.
 * Clean, focused hierarchy:
 *   Word (large) + 🔊 TTS next to it
 *   IPA (smaller, below)
 *   Type + CEFR as small badges (one row)
 *   Meaning (prominent)
 *   Example (italic, soft)
 *   Memory Clue (subtle highlighted block)
 */
export default function VocabularyAnswerDetails({ word, hideMeaning = false, hideClue = false }) {
  if (!word) return null;

  return (
    <div className="rounded-card border border-border-color bg-surface-sidebar p-5 text-left text-sm text-text-secondary shadow-sm">
      {/* Word + TTS */}
      <div className="flex items-center gap-2">
        <h4 className="text-2xl font-bold tracking-tight text-text-primary">
          {word.word}
        </h4>
        <button
          type="button"
          onClick={() => ttsService.speak(word.word)}
          aria-label="Phát âm từ"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-hover hover:text-brand-primary"
        >
          <span aria-hidden="true">🔊</span>
        </button>
      </div>

      {/* IPA */}
      {word.ipa && (
        <div className="mt-0.5 font-mono text-sm text-text-secondary">
          /{word.ipa}/
        </div>
      )}

      {/* Type + CEFR badges */}
      {(word.word_type || word.cefr_level) && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {word.word_type && (
            <span className="rounded-md bg-surface-hover px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-text-secondary">
              {word.word_type.replace(/_/g, ' ')}
            </span>
          )}
          {word.cefr_level && (
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${cefrBadgeClass(
                word.cefr_level,
              )}`}
            >
              {cefrLabel(word.cefr_level)}
            </span>
          )}
        </div>
      )}

      {/* Meaning + Memory Clue — cùng một khu vực thông tin ngữ nghĩa.
          Gợi ý xuất hiện ngay bên dưới Nghĩa, giữ là hai field riêng biệt. */}
      {word.meaning && !hideMeaning && (
        <div className="mt-3 text-lg font-semibold text-text-primary">
          {word.meaning}
        </div>
      )}

      {/* Memory Clue (chỉ hiện khi có; không render block rỗng) */}
      {word.memory_clue && !hideClue && (
        <div className="mt-2 rounded-lg border-l-2 border-amber-400 bg-amber-50 px-3 py-2 text-sm text-zinc-700">
          <span className="text-sm font-semibold text-amber-800">
            💡 Gợi ý
          </span>
          <p className="mt-1">{word.memory_clue}</p>
        </div>
      )}

      {/* Example */}
      {word.example && (
        <div className="mt-2 text-sm italic text-text-secondary">
          “{word.example}”
        </div>
      )}
    </div>
  );
}

