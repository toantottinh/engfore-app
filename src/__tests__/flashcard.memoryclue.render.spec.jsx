import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';

// VocabularyAnswerDetails imports the root-level tts service; mock every
// specifier shape used across the codebase (pattern của
// session.counter.ui.spec.jsx).
vi.mock('../../tts.service.js', () => ({ ttsService: { isSupported: () => true, speak: vi.fn() } }));
vi.mock('../../../tts.service.js', () => ({ ttsService: { isSupported: () => true, speak: vi.fn() } }));
vi.mock('/home/asus/EngFore/tts.service.js', () => ({ ttsService: { isSupported: () => true, speak: vi.fn() } }));

import VocabularyAnswerDetails from '../components/VocabularyAnswerDetails.jsx';

// ------------------------------------------------------------------
// REGRESSION — Memory Clue hiển thị trên Flashcard (mặt sau của thẻ).
//
// Component nhận `word` nguyên vẹn từ queue (LearningSession flashcard
// mode, Review, FlashcardPractice) và tự chịu trách nhiệm render/không
// render block 💡 Gợi ý. Các test này khoá UI contract:
//   - có clue  → render ĐÚNG giá trị user_vocabulary.memory_clue;
//   - clue null/rỗng/thiếu field → KHÔNG render block (không crash).
// ------------------------------------------------------------------

const baseWord = {
  id: '0586353e-371d-4c3a-897b-bd26c2857c9c',
  word: 'announce',
  ipa: '/əˈnaʊns/',
  word_type: 'verb',
  cefr_level: 'B1',
  meaning: 'thông báo',
  example: 'They announced the results this morning.',
};

describe('VocabularyAnswerDetails (Flashcard revealed side) — Memory Clue', () => {
  // Vitest chạy không bật globals → Testing Library không tự cleanup DOM giữa
  // các test (pattern chung của repo: afterEach(cleanup)).
  afterEach(cleanup);

  it('Case 1: memory_clue tồn tại → render block 💡 Gợi ý với ĐÚNG giá trị của user', () => {
    render(
      <VocabularyAnswerDetails
        word={{ ...baseWord, memory_clue: 'Chính thức cho mọi người biết một thông tin' }}
      />
    );
    expect(screen.getByText(/Gợi ý/)).toBeInTheDocument();
    expect(
      screen.getByText('Chính thức cho mọi người biết một thông tin')
    ).toBeInTheDocument();
    // Các phần còn lại của thẻ vẫn hiển thị bình thường.
    expect(screen.getByText('announce')).toBeInTheDocument();
    expect(screen.getByText('thông báo')).toBeInTheDocument();
    expect(screen.getByText(/əˈnaʊns/)).toBeInTheDocument();
  });

  it('Case 2: memory_clue = NULL → KHÔNG render block Memory Clue', () => {
    render(<VocabularyAnswerDetails word={{ ...baseWord, memory_clue: null }} />);
    expect(screen.queryByText(/Gợi ý/)).not.toBeInTheDocument();
    expect(
      screen.queryByText('Chính thức cho mọi người biết một thông tin')
    ).not.toBeInTheDocument();
    // Thẻ vẫn hiển thị phần nội dung còn lại.
    expect(screen.getByText('announce')).toBeInTheDocument();
    expect(screen.getByText('thông báo')).toBeInTheDocument();
  });

  it('Case 2b: memory_clue = "" (fallback rỗng từ service) → KHÔNG render block Memory Clue', () => {
    render(<VocabularyAnswerDetails word={{ ...baseWord, memory_clue: '' }} />);
    expect(screen.queryByText(/Gợi ý/)).not.toBeInTheDocument();
  });

  it('Case 3: word thiếu hẳn field memory_clue (user_vocabulary rỗng) → không crash, thẻ render bình thường', () => {
    render(<VocabularyAnswerDetails word={{ ...baseWord }} />);
    expect(screen.getByText('announce')).toBeInTheDocument();
    expect(screen.getByText('thông báo')).toBeInTheDocument();
    expect(screen.queryByText(/Gợi ý/)).not.toBeInTheDocument();
  });

  it('word = null/undefined → component không crash (guard hiện có)', () => {
    render(<VocabularyAnswerDetails word={null} />);
    expect(screen.queryByText(/Gợi ý/)).not.toBeInTheDocument();
  });
});
