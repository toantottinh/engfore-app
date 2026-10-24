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
    <div className="rounded-card border border-border-color bg-surface-sidebar p-4 text-left text-sm text-text-secondary shadow-sm">
      {/* Word + TTS */}
      <div className="flex items-center gap-2">
        <h4 className="text-xl font-bold tracking-tight text-text-primary">
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
        <div className="mt-2 flex flex-wrap items-center gap-2">
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
        <div className="mt-2 text-base font-semibold text-text-primary">
          {word.meaning}
        </div>
      )}

      {/* Memory Clue (chỉ hiện khi có; không render block rỗng) */}
      {word.memory_clue && !hideClue && (
        <div className="mt-1.5 rounded-lg border-l-2 border-amber-400 bg-amber-50 px-3 py-2 text-sm text-zinc-700">
          <span className="text-sm font-semibold text-amber-800">
            💡 Gợi ý
          </span>
          <p className="mt-1">{word.memory_clue}</p>
        </div>
      )}

      {/* Example */}
      {(word.example || word.example_sentence) && (
        <div className="flex items-center gap-2 mt-1.5">
          <span className="italic text-gray-700 text-sm sm:text-base">
            “{word.example || word.example_sentence}”
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              const exampleText = word.example || word.example_sentence;
              if (exampleText) ttsService.speak(exampleText);
            }}
            className="p-1 text-gray-400 hover:text-indigo-600 rounded hover:bg-gray-100 transition-colors"
            title="Nghe câu ví dụ"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

