import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import React from 'react';

// =====================================================================
// UI tests — Word Set Detail: checkbox selection, select-all (indeterminate),
// bulk-delete toolbar + confirmation modal, edit-word modal.
// Hook được mock tĩnh; test mô phỏng state updates bằng rerender.
// =====================================================================

const { hookState, hookMocks, WORDS } = vi.hoisted(() => ({
  hookState: { selection: [] },
  hookMocks: {
    toggleWordSelection: vi.fn(),
    selectAllWords: vi.fn(),
    clearSelection: vi.fn(),
    removeSelectedWords: vi.fn(),
    removeWordFromSet: vi.fn(),
    updateWord: vi.fn(),
    addWord: vi.fn(),
    updateSetDetails: vi.fn(),
    loadSetAndWords: vi.fn(),
  },
  WORDS: [
    { id: 'w1', word: 'allow', ipa: 'əˈlaʊ', word_type: 'verb', meaning: 'cho phép', example: 'You can allow them.', memory_clue: 'a-lâu', cefr_level: 'A2', word_id: 'gw1' },
    { id: 'w2', word: 'attention', ipa: 'əˈtenʃn', word_type: 'noun', meaning: 'sự chú ý', example: '', memory_clue: '', cefr_level: 'B1', word_id: 'gw2' },
    { id: 'w3', word: 'airline', ipa: 'eəlaɪn', word_type: 'noun', meaning: 'hãng hàng không', example: '', memory_clue: '', cefr_level: 'B1' },
  ],
}));

const baseHook = () => ({
  set: { id: 'set-a', name: 'Set A', user_id: 'user-1' },
  words: WORDS,
  loading: false,
  error: null,
  mutationLoading: false,
  ...hookMocks,
  selectedWordSenseIds: hookState.selection,
});

vi.mock('../hooks/useVocabularyDetail.js', () => ({
  useVocabularyDetail: vi.fn(() => baseHook()),
}));

vi.mock('../services/vocabulary.service.js', () => ({
  deleteVocabularySet: vi.fn(async () => ({ error: null })),
}));

vi.mock('../../tts.service.js', () => ({ ttsService: {} }));

import VocabularyDetail from '../pages/VocabularyDetail/index.jsx';
import { useVocabularyDetail } from '../hooks/useVocabularyDetail.js';

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/vocabulary/sets/set-a']}>
      <Routes>
        <Route path="/vocabulary/sets/:setId" element={<VocabularyDetail />} />
      </Routes>
    </MemoryRouter>
  );

const rerenderPage = (ui) => ui.rerender(
  <MemoryRouter initialEntries={['/vocabulary/sets/set-a']}>
    <Routes>
      <Route path="/vocabulary/sets/:setId" element={<VocabularyDetail />} />
    </Routes>
  </MemoryRouter>
);

const headerCheckbox = () => screen.getByRole('checkbox', { name: 'Chọn tất cả từ' });

beforeEach(() => {
  hookState.selection = [];
  Object.values(hookMocks).forEach((m) => m.mockClear());
});

describe('Word Set Detail — checkbox selection', () => {
  it('render 3 row checkbox (unchecked) + header checkbox + không có toolbar', () => {
    const ui = renderPage();
    expect(screen.getAllByRole('checkbox', { name: /^Chọn từ / })).toHaveLength(3);
    expect(headerCheckbox().checked).toBe(false);
    expect(headerCheckbox().indeterminate).toBe(false);
    expect(screen.queryByText(/Đã chọn .* từ/)).toBeNull();
    // Row checkbox checked=false
    screen.getAllByRole('checkbox', { name: /^Chọn từ / }).forEach((cb) => {
      expect(cb.checked).toBe(false);
    });
    ui.unmount();
  });

  it('click row checkbox → toggleWordSelection(id); chọn một phần → header indeterminate + toolbar hiện', () => {
    const ui = renderPage();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Chọn từ allow' }));
    expect(hookMocks.toggleWordSelection).toHaveBeenCalledWith('w1');

    // Mô phỏng hook state cập nhật (selection = ['w1']) → rerender
    hookState.selection = ['w1'];
    rerenderPage(ui);

    expect(screen.getByText('Đã chọn 1 từ')).toBeDefined();
    expect(screen.getByRole('checkbox', { name: 'Chọn từ allow' }).checked).toBe(true);
    const header = headerCheckbox();
    expect(header.checked).toBe(false);
    expect(header.indeterminate).toBe(true); // chọn một phần
    ui.unmount();
  });

  it('select-all: click header khi chưa đủ → selectAllWords(all ids); đã chọn tất cả → click lại → clearSelection', () => {
    const ui = renderPage();

    fireEvent.click(headerCheckbox());
    expect(hookMocks.selectAllWords).toHaveBeenCalledWith(['w1', 'w2', 'w3']);

    // Simulate all selected
    hookState.selection = ['w1', 'w2', 'w3'];
    rerenderPage(ui);
    expect(headerCheckbox().checked).toBe(true);
    expect(headerCheckbox().indeterminate).toBe(false);
    expect(screen.getByText('Đã chọn 3 từ')).toBeDefined();

    fireEvent.click(headerCheckbox());
    expect(hookMocks.clearSelection).toHaveBeenCalled();
    ui.unmount();
  });
});

describe('Word Set Detail — bulk delete flow', () => {
  it('toolbar → modal xác nhận đúng số từ → confirm gọi removeSelectedWords; lỗi → modal stays + Alert; success → modal đóng', async () => {
    hookState.selection = ['w1', 'w2'];
    hookMocks.removeSelectedWords.mockResolvedValueOnce({ error: 'Bạn không có quyền xóa từ khỏi bộ từ này.' });
    const ui = renderPage();

    // Toolbar hiển thị
    expect(screen.getByText('Đã chọn 2 từ')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Xóa khỏi bộ từ' }));

    // Modal xác nhận với số lượng đúng
    expect(await screen.findByText('Xóa 2 từ khỏi bộ từ?')).toBeDefined();
    expect(screen.getByText(/Từ vẫn còn trong Vocabulary/)).toBeDefined();

    // Confirm (footer button — button thứ 2 cùng tên)
    const confirmBtns = screen.getAllByRole('button', { name: 'Xóa khỏi bộ từ' });
    fireEvent.click(confirmBtns[confirmBtns.length - 1]);
    await screen.findByText('Bạn không có quyền xóa từ khỏi bộ từ này.');

    // Lỗi → modal VẪN mở + giữ selection (removeSelectedWords đã gọi đúng ids)
    expect(hookMocks.removeSelectedWords).toHaveBeenCalledWith(['w1', 'w2']);
    expect(screen.getByText('Xóa 2 từ khỏi bộ từ?')).toBeDefined();

    // Success case → modal đóng
    hookMocks.removeSelectedWords.mockResolvedValueOnce({ error: null });
    const btns = screen.getAllByRole('button', { name: 'Xóa khỏi bộ từ' });
    fireEvent.click(btns[btns.length - 1]);
    ui.rerender(
      <MemoryRouter initialEntries={['/vocabulary/sets/set-a']}>
        <Routes>
          <Route path="/vocabulary/sets/:setId" element={<VocabularyDetail />} />
        </Routes>
      </MemoryRouter>
    );
    await vi.waitFor(() => {
      expect(screen.queryByText('Xóa 2 từ khỏi bộ từ?')).toBeNull();
    });
    ui.unmount();
  });

  it('1 từ được chọn → modal text số ít', () => {
    hookState.selection = ['w1'];
    const ui = renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Xóa khỏi bộ từ' }));
    expect(screen.getByText('Xóa từ này khỏi bộ từ?')).toBeDefined();
    ui.unmount();
  });
});

describe('Word Set Detail — edit word modal', () => {
  it('Chỉnh sửa → modal mở; Word + Meaning readonly; Example/Memory Clue editable; save gọi updateWord đúng args', async () => {
    hookMocks.updateWord.mockResolvedValueOnce({ error: null });
    const ui = renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Chỉnh sửa allow' }));
    expect(await screen.findByText('Chỉnh sửa từ')).toBeDefined();

    // Word + Meaning là global/identity → readonly (không user-editable)
    expect(screen.getByDisplayValue('allow').disabled).toBe(true);
    expect(screen.getByDisplayValue('cho phép').disabled).toBe(true);

    expect(screen.getByDisplayValue('You can allow them.')).toBeDefined();
    expect(screen.getByDisplayValue('a-lâu')).toBeDefined();

    // Sửa Example + Memory Clue (user-owned) rồi lưu
    const exampleInput = screen.getByDisplayValue('You can allow them.');
    fireEvent.change(exampleInput, { target: { value: 'You may allow them.' } });
    const clueInput = screen.getByDisplayValue('a-lâu');
    fireEvent.change(clueInput, { target: { value: 'a-lâu-lặc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    await vi.waitFor(() => {
      expect(hookMocks.updateWord).toHaveBeenCalledWith('w1', {
        example: 'You may allow them.',
        memoryClue: 'a-lâu-lặc',
      });
    });
    ui.unmount();
  });

  it('word không có example/memory_clue → save gửi null (không gửi chuỗi rỗng)', async () => {
    hookMocks.updateWord.mockResolvedValueOnce({ error: null });
    const ui = renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Chỉnh sửa airline' }));
    await screen.findByText('Chỉnh sửa từ');
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    await vi.waitFor(() => {
      expect(hookMocks.updateWord).toHaveBeenCalledWith('w3', {
        example: null,
        memoryClue: null,
      });
    });
    ui.unmount();
  });

  it('updateWord lỗi → modal vẫn mở, hiển thị error, không đóng giả', async () => {
    hookMocks.updateWord.mockResolvedValueOnce({ error: 'Bạn chỉ có thể sửa từ nằm trong vocabulary của mình.' });
    const ui = renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Chỉnh sửa attention' }));
    await screen.findByText('Chỉnh sửa từ');
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    await screen.findByText('Bạn chỉ có thể sửa từ nằm trong vocabulary của mình.');
    expect(screen.getByText('Chỉnh sửa từ')).toBeDefined(); // modal vẫn mở
    ui.unmount();
  });
});


