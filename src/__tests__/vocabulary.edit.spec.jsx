import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Vocabulary from '../pages/Vocabulary/index.jsx';
import { AuthProvider } from '../hooks/useAuth.jsx';
import ProtectedRoute from '../components/ProtectedRoute.jsx';

// ------------------------------------------------------------------
// Regression test cho lỗi: trên trang Vocabulary, bấm vào một từ phải
// MỞ MODAL chỉnh sửa từ, KHÔNG được redirect về /login.
//
// Root cause: word card trước đây có `onClick={() => navigate('/learn/session')}`
// -> đẩy user khỏi giao diện /vocabulary tới path `/learn/session` (không có
// route khớp vì route thật là `/learn/session/:setId`) -> rơi về trang công khai.
// Fix: onClick giờ mở modal chỉnh sửa từ ngay tại chỗ.
// ------------------------------------------------------------------

const USER = { id: 'user-1', email: 'test@example.com' };

const getUserVocabularyMock = vi.fn();
const updateUserWordMock = vi.fn(async () => ({ error: null }));
const addWordsToSetMock = vi.fn(async () => ({ error: null }));
const removeFromVocabularyMock = vi.fn(async () => ({ error: null }));
const getVocabularySetsMock = vi.fn(async () => ({ data: [], error: null }));
const createVocabularySetMock = vi.fn(async () => ({ error: null }));
const updateVocabularySetMock = vi.fn(async () => ({ error: null }));
const deleteVocabularySetMock = vi.fn(async () => ({ error: null }));
const reorderVocabularySetsMock = vi.fn(async () => ({ error: null }));

vi.mock('../services/auth.service.js', () => ({
  authService: {
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    getSession: async () => ({ data: { session: null }, error: null }),
    ensureProfile: async () => ({ data: null, error: null }),
  },
}));

vi.mock('../services/vocabulary.service.js', () => ({
  getUserVocabulary: (...args) => getUserVocabularyMock(...args),
  updateUserWord: (...args) => updateUserWordMock(...args),
  addWordsToSet: (...args) => addWordsToSetMock(...args),
  removeFromVocabulary: (...args) => removeFromVocabularyMock(...args),
  getVocabularySets: (...args) => getVocabularySetsMock(...args),
  createVocabularySet: (...args) => createVocabularySetMock(...args),
  updateVocabularySet: (...args) => updateVocabularySetMock(...args),
  deleteVocabularySet: (...args) => deleteVocabularySetMock(...args),
  reorderVocabularySets: (...args) => reorderVocabularySetsMock(...args),
}));

const WORD = {
  id: 'sense-1',
  word_id: 'word-1',
  word: 'apple',
  ipa: '/ˈæp.əl/',
  cefr_level: 'A1',
  word_type: 'noun',
  meaning: 'quả táo',
  memory_clue: 'quả táo đỏ',
  example: 'I eat an apple.',
  mastery_level: 0,
  state: 'new',
};

function mountVocabulary() {
  return render(
    <MemoryRouter initialEntries={['/vocabulary']}>
      <AuthProvider initialUser={USER}>
        <Routes>
          <Route path="/vocabulary" element={<Vocabulary />} />
          <Route path="/login" element={<div>LOGIN PAGE</div>} />
          <Route path="/learn/session/:setId" element={<div>LEARN SESSION PAGE</div>} />
          <Route path="*" element={<div>FALLBACK PAGE</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('Vocabulary — click word mở modal sửa từ (không redirect /login)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserVocabularyMock.mockImplementation(async () => ({ data: [WORD], error: null }));
    getVocabularySetsMock.mockImplementation(async () => ({ data: [], error: null }));
  });

  afterEach(() => cleanup());

  it('authenticated user: bấm vào từ mở modal chỉnh sửa và KHÔNG redirect về /login', async () => {
    mountVocabulary();

    // Word hiển thị trong library.
    await screen.findByText('apple');
    // Không ở trang login khi vào /vocabulary.
    expect(screen.queryByText('LOGIN PAGE')).toBeNull();

    // Bấm vào card từ.
    await userEvent.click(screen.getByRole('button', { name: /Sửa từ apple/ }));

    // Modal chỉnh sửa từ mở thành công.
    expect(screen.getByRole('heading', { name: 'Chỉnh sửa từ' })).toBeInTheDocument();
    expect(screen.getByLabelText('Từ tiếng Anh')).toHaveValue('apple');
    expect(screen.getByLabelText('Nghĩa tiếng Việt')).toHaveValue('quả táo');

    // KHÔNG redirect về /login (vẫn còn trong giao diện /vocabulary).
    expect(screen.queryByText('LOGIN PAGE')).toBeNull();
    expect(screen.getByText('Quản lý từ vựng và bộ từ của bạn.')).toBeInTheDocument();
  });

  it('authenticated user: lưu từ qua modal gọi updateUserWord và đóng modal', async () => {
    mountVocabulary();
    await screen.findByText('apple');

    await userEvent.click(screen.getByRole('button', { name: /Sửa từ apple/ }));
    expect(screen.getByRole('heading', { name: 'Chỉnh sửa từ' })).toBeInTheDocument();

    // Sửa nghĩa rồi lưu.
    await userEvent.clear(screen.getByLabelText('Nghĩa tiếng Việt'));
    await userEvent.type(screen.getByLabelText('Nghĩa tiếng Việt'), 'trái táo');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu từ' }));

    await waitFor(() => expect(updateUserWordMock).toHaveBeenCalledTimes(1));
    expect(updateUserWordMock).toHaveBeenCalledWith(
      'sense-1',
      'word-1',
      expect.objectContaining({ word: 'apple', meaning: 'trái táo' })
    );

    // Modal đóng; vẫn ở /vocabulary, không chuyển tới /login.
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Chỉnh sửa từ' })).toBeNull()
    );
    expect(screen.queryByText('LOGIN PAGE')).toBeNull();

    // Updated data now appears in the list (meaning updated in place).
    await screen.findByText('trái táo');
    expect(screen.queryByText('quả táo')).toBeNull();
  });

  it('should NOT navigate to the learn session when clicking a word', async () => {
    mountVocabulary();
    await screen.findByText('apple');

    await userEvent.click(screen.getByRole('button', { name: /Sửa từ apple/ }));

    expect(screen.queryByText('LEARN SESSION PAGE')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Chỉnh sửa từ' })).toBeInTheDocument();
  });
});

describe('Authentication — user chưa đăng nhập vẫn bị bảo vệ', () => {
  afterEach(() => cleanup());

  it('ProtectedRoute redirect user chưa đăng nhập về /login', async () => {
    render(
      <MemoryRouter initialEntries={['/vocabulary']}>
        <AuthProvider>
          <Routes>
            <Route element={<ProtectedRoute />}>
              <Route path="/vocabulary" element={<div>PROTECTED VOCAB</div>} />
            </Route>
            <Route path="/login" element={<div>LOGIN PAGE</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('LOGIN PAGE')).toBeInTheDocument());
    expect(screen.queryByText('PROTECTED VOCAB')).toBeNull();
  });
});

