import React, { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getGrammarRuleById, getVocabularySensesByType } from '../../services/grammar.service.js';
import { deriveGrammarStatus, grammarSessionPath } from '../../utils/grammar-status.js';
import { ruleTitleToWordType } from '../../utils/grammar-vocabulary.js';
import { cefrBadgeClass, cefrLabel } from '../../utils/cefr.js';
import Button from '../../components/ui/Button.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import Alert from '../../components/ui/Alert.jsx';

// Emoji trạng thái học (dữ liệu lấy từ hệ thống /learn — user_grammar via
// cùng SRS engine; read-only ở đây).
const STATUS_EMOJI = { new: '🟢', again: '🔴', review: '🟡' };

const EXERCISE_TYPE_LABELS = {
  multiple_choice: 'Trắc nghiệm',
  fill_blank: 'Điền vào chỗ trống',
  translation: 'Dịch',
  correction: 'Sửa câu',
  rearrange: 'Xếp câu',
  production: 'Tự viết',
};

/**
 * RULE DETAIL (/grammar/rule/:ruleId) — Rule + Explanation + Exercises liên
 * quan + "Từ vựng liên quan" (Vocabulary Type integration, đọc từ DB — không
 * AI). Chỉ ĐỌC: luyện tập thật diễn ra trong Grammar Session.
 */
export default function GrammarRuleDetail() {
  const { ruleId } = useParams();
  const [rule, setRule] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Vocabulary integration (non-fatal): chỉ fetch khi rule title ánh xạ được
  // sang một word_type đã lưu (vd rule 'Adjective' -> 'adjective').
  const wordType = ruleTitleToWordType(rule?.title);
  const [vocabSenses, setVocabSenses] = useState([]);
  const [vocabLoading, setVocabLoading] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      setVocabSenses([]);
      const { data, error: err } = await getGrammarRuleById(ruleId);
      if (!active) return;
      if (err) {
        if (import.meta.env.DEV) {
          console.error('[GrammarRuleDetail] load error:', err);
        }
        setError(err?.message || 'Không tải được kiến thức ngữ pháp. Vui lòng thử lại.');
        setRule(null);
      } else {
        setRule(data);
      }
      setLoading(false);
    };
    load();
    return () => {
      active = false;
    };
  }, [ruleId]);

  useEffect(() => {
    if (!wordType) return undefined;
    let active = true;
    setVocabLoading(true);
    getVocabularySensesByType(wordType, 8)
      .then(({ data }) => {
        if (active) setVocabSenses(data || []);
      })
      .catch(() => {
        if (active) setVocabSenses([]);
      })
      .finally(() => {
        if (active) setVocabLoading(false);
      });
    return () => {
      active = false;
    };
  }, [wordType]);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (error || !rule) {
    return (
      <div className="py-6">
        <Alert type="error" message={error || 'Không tìm thấy kiến thức ngữ pháp.'} />
        <div className="mt-4">
          <Link to="/grammar">
            <Button variant="secondary">← Về thư viện ngữ pháp</Button>
          </Link>
        </div>
      </div>
    );
  }

  const { key, label } = deriveGrammarStatus(rule.user_grammar || null);
  const mastery = rule.user_grammar?.mastery_level || 0;
  const topicHref = rule.topic?.id ? `/grammar/${rule.topic.id}` : '/grammar';

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link to={topicHref} className="text-sm text-brand-primary hover:underline">
        ← {rule.topic?.title || 'Về thư viện ngữ pháp'}
      </Link>

      <div className="rounded-xl border border-border-color bg-surface-sidebar p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">{rule.title}</h1>
          </div>
          <span className="whitespace-nowrap text-sm text-text-secondary">
            {STATUS_EMOJI[key]} {label}
          </span>
        </div>

        {/* RULE — kiến thức cốt lõi của item */}
        <p className="mt-4 rounded-lg border border-brand-primary/30 bg-brand-primary-soft p-3 text-base font-semibold text-text-primary">
          {rule.rule}
        </p>

        {rule.explanation && (
          <p className="mt-3 text-sm text-text-secondary">{rule.explanation}</p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
          {rule.topic?.cefr && (
            <span
              className={`rounded-full px-2 py-0.5 font-medium ${cefrBadgeClass(rule.topic.cefr)}`}
            >
              {cefrLabel(rule.topic.cefr)}
            </span>
          )}
          {rule.topic?.category && (
            <span className="rounded-full bg-surface-hover px-2 py-0.5 text-text-secondary">
              {rule.topic.category}
            </span>
          )}
          <span className="text-text-secondary/70">
            Bài tập: {rule.exercise_count}
            {rule.exercise_types?.length > 0 &&
              ` (${rule.exercise_types.map((t) => EXERCISE_TYPE_LABELS[t] || t).join(', ')})`}
          </span>
          {mastery > 0 && <span className="text-text-secondary/70">Phản xạ {mastery}/5</span>}
        </div>
      </div>

      {/* Vocabulary Type integration — đọc word_senses từ DB Vocabulary hiện có.
          Multi-sense giữ nguyên: một word có thể xuất hiện với nhiều type. */}
      {wordType && (
        <div className="rounded-xl border border-border-color bg-surface-sidebar p-6">
          <h2 className="mb-1 text-lg font-semibold text-text-primary">Từ vựng liên quan</h2>
          <p className="mb-3 text-xs text-text-secondary">
            Ví dụ từ kho từ vựng hiện có với loại từ{' '}
            <span className="font-medium text-text-primary">{wordType}</span> (dữ liệu
            từ Vocabulary — không suy luận).
          </p>
          {vocabLoading ? (
            <p className="text-sm text-text-secondary">Đang tải từ vựng...</p>
          ) : vocabSenses.length === 0 ? (
            <p className="text-sm text-text-secondary">
              Chưa có từ vựng nào với loại từ này trong kho.
            </p>
          ) : (
            <ul className="space-y-2">
              {vocabSenses.map((s) => (
                <li
                  key={s.id}
                  className="flex flex-wrap items-baseline gap-2 rounded-lg bg-surface px-3 py-2"
                >
                  <span className="text-sm font-semibold text-text-primary">
                    {s.word?.word || '—'}
                  </span>
                  <span className="rounded-full bg-surface-hover px-2 py-0.5 text-[11px] font-medium text-text-secondary">
                    {s.word_type}
                  </span>
                  <span className="text-sm text-text-secondary">{s.meaning}</span>
                  {s.example && (
                    <span className="w-full text-xs italic text-text-secondary/70">
                      “{s.example}”
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Exercises liên quan — luyện thử (reveal đáp án, KHÔNG ghi SRS:
          SRS chỉ diễn ra trong phiên học qua /learn). */}
      <div className="rounded-xl border border-border-color bg-surface-sidebar p-6">
        <h2 className="mb-3 text-lg font-semibold text-text-primary">Bài tập</h2>
        {rule.exercises.length === 0 ? (
          <p className="text-sm text-text-secondary">
            Chưa có bài tập cho kiến thức này. Hãy quay lại sau.
          </p>
        ) : (
          <ol className="space-y-4">
            {rule.exercises.map((ex, idx) => (
              <li key={ex.id} className="rounded-lg border border-border-color bg-surface p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-text-primary">
                    {idx + 1}. {ex.question}
                  </p>
                  <span className="whitespace-nowrap rounded-full bg-surface-hover px-2 py-0.5 text-[11px] text-text-secondary">
                    {EXERCISE_TYPE_LABELS[ex.type] || ex.type}
                  </span>
                </div>
                {ex.options?.length > 0 && (
                  <ul className="mt-2 list-inside list-disc text-sm text-text-secondary">
                    {ex.options.map((opt, i) => (
                      <li key={i}>{opt}</li>
                    ))}
                  </ul>
                )}
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-medium text-brand-primary">
                    Xem đáp án
                  </summary>
                  <p className="mt-1 text-sm text-text-primary">{ex.answer || '—'}</p>
                  {ex.explanation && (
                    <p className="mt-1 text-xs text-text-secondary">{ex.explanation}</p>
                  )}
                </details>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Học — điều hướng sang phiên học của rule này (SRS flow của /learn). */}
      <div className="rounded-xl border border-border-color bg-surface p-6">
        <Link to={grammarSessionPath(rule.id)}>
          <Button size="lg">Học kiến thức này</Button>
        </Link>
      </div>
    </div>
  );
}