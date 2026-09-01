import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import GrammarLibrary from '../pages/Grammar/index.jsx';

/**
 * GRAMMAR LIBRARY render test (/grammar).
 * - Topics được render, nhóm theo CEFR (A1..C2), mỗi card có title/rule_count
 *   và link "Xem" -> topic detail.
 * - Chỉ ĐỌC: load qua getGrammarTopics (service mock) — không ghi SRS.
 */

const getGrammarTopicsMock = vi.fn();

vi.mock('../services/grammar.service.js', () => ({
  getGrammarTopics: (...a) => getGrammarTopicsMock(...a),
}));

describe('Grammar library (/grammar) render', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getGrammarTopicsMock.mockResolvedValue({
      data: [
        { id: 't1', title: 'Từ loại', description: 'Noun / Verb / Adjective...', cefr: 'A1', category: 'Cơ bản', rule_count: 8 },
        { id: 't2', title: 'To be', description: 'am / is / are', cefr: 'A1', category: 'Cơ bản', rule_count: 6 },
        { id: 't3', title: 'Present Simple', description: 'Thì hiện tại đơn', cefr: 'A1', category: 'Cơ bản', rule_count: 10 },
      ],
      error: null,
    });
  });
  afterEach(() => cleanup());

  it('renders topic cards with title + rule_count + Xem link (grouped by CEFR)', async () => {
    render(
      <MemoryRouter>
        <GrammarLibrary />
      </MemoryRouter>
    );

    expect(await screen.findByText('Từ loại')).toBeTruthy();
    expect(screen.getByText('To be')).toBeTruthy();
    expect(screen.getByText('Present Simple')).toBeTruthy();

    // Mỗi card hiển thị số kiến thức + nút điều hướng Xem.
    const xemLinks = screen.getAllByRole('link', { name: 'Xem' });
    expect(xemLinks).toHaveLength(3);
    expect(screen.getByText('8 kiến thức')).toBeTruthy();

    // Tổng topic/kiến thức.
    expect(screen.getByText(/3 topic · 24 kiến thức/)).toBeTruthy();
  });

  it('empty state when no topics', async () => {
    getGrammarTopicsMock.mockResolvedValue({ data: [], error: null });
    render(
      <MemoryRouter>
        <GrammarLibrary />
      </MemoryRouter>
    );
    expect(await screen.findByText(/Chưa có nội dung ngữ pháp/)).toBeTruthy();
  });

  it('error state renders alert + retry', async () => {
    getGrammarTopicsMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    render(
      <MemoryRouter>
        <GrammarLibrary />
      </MemoryRouter>
    );
    expect(await screen.findByText(/Không tải được thư viện ngữ pháp/)).toBeTruthy();
  });
});