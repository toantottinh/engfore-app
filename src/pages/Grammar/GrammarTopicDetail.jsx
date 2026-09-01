import React, { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getGrammarTopicById } from '../../services/grammar.service.js';
import { deriveGrammarStatus } from '../../utils/grammar-status.js';
import { cefrBadgeClass, cefrLabel } from '../../utils/cefr.js';
import Spinner from '../../components/ui/Spinner.jsx';
import Alert from '../../components/ui/Alert.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import Button from '../../components/ui/Button.jsx';

// Emoji trạng thái học (dữ liệu lấy từ hệ thống /learn — user_grammar via
// cùng SRS engine; read-only ở đây).
const STATUS_EMOJI = { new: '🟢', again: '🔴', review: '🟡' };

/**
 * TOPIC DETAIL (/grammar/:topicId) — danh sách Grammar Rules/Knowledge của
 * topic. Chỉ ĐỌC: trạng thái học lấy từ user_grammar (SRS thuộc /learn).
 */
export default function GrammarTopicDetail() {
  const { topicId } = useParams();
  const [topic, setTopic] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      const { data, error: err } = await getGrammarTopicById(topicId);
      if (!active) return;
      if (err) {
        if (import.meta.env.DEV) {
          console.error('[GrammarTopicDetail] load error:', err);
        }
        setError(err?.message || 'Không tải được topic ngữ pháp. Vui lòng thử lại.');
        setTopic(null);
      } else {
        setTopic(data);
      }
      setLoading(false);
    };
    load();
    return () => {
      active = false;
    };
  }, [topicId]);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (error || !topic) {
    return (
      <div className="py-6">
        <Alert type="error" message={error || 'Không tìm thấy topic ngữ pháp.'} />
        <div className="mt-4">
          <Link to="/grammar">
            <Button variant="secondary">← Về thư viện ngữ pháp</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link to="/grammar" className="text-sm text-brand-primary hover:underline">
        ← Về thư viện ngữ pháp
      </Link>

      <div className="rounded-xl border border-border-color bg-surface-sidebar p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">{topic.title}</h1>
            {topic.description && (
              <p className="mt-2 text-sm text-text-secondary">{topic.description}</p>
            )}
          </div>
          <span
            className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${cefrBadgeClass(topic.cefr)}`}
          >
            {cefrLabel(topic.cefr)}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-text-secondary/70">
          {topic.category && (
            <span className="rounded-full bg-surface-hover px-2 py-0.5">
              {topic.category}
            </span>
          )}
          <span>{topic.rules.length} kiến thức</span>
        </div>
      </div>

      {/* Danh sách rules — mỗi rule là một knowledge item có thể học riêng */}
      {topic.rules.length === 0 ? (
        <EmptyState
          icon="📐"
          title="Topic chưa có kiến thức."
          description="Quản trị viên sẽ bổ sung các kiến thức cho topic này."
        />
      ) : (
        <div className="space-y-3">
          {topic.rules.map((rule) => {
            const { key, label } = deriveGrammarStatus(rule.user_grammar || null);
            return (
              <div
                key={rule.id}
                className="rounded-xl border border-border-color bg-surface-sidebar p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-text-primary">{rule.title}</h3>
                    <p className="mt-1 text-sm text-text-primary">{rule.rule}</p>
                  </div>
                  <span className="whitespace-nowrap text-sm text-text-secondary">
                    {STATUS_EMOJI[key]} {label}
                  </span>
                </div>

                {rule.explanation && (
                  <p className="mt-2 text-sm text-text-secondary">{rule.explanation}</p>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-text-secondary/70">
                    {rule.exercise_count} bài tập
                  </span>
                  <Link
                    to={`/grammar/rule/${rule.id}`}
                    className="ml-auto rounded-lg border border-border-color px-3 py-1.5 text-sm font-medium text-text-primary transition-colors hover:bg-surface-hover"
                  >
                    Chi tiết
                  </Link>
                  <Link
                    to={`/grammar/session/${rule.id}`}
                    className="rounded-lg bg-brand-primary px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-primary-hover"
                  >
                    Học
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}