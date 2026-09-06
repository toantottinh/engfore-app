import React from 'react';
import { describe, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Import from '../pages/Import/index.jsx';
import { AuthProvider } from '../hooks/useAuth.jsx';

// Import page — destination Word Set behavior (chong stale destSetId).
// Mock service + auth. Verify REAL page behavior: payload sent to
// importWords must never contain a stale/deleted destination Set id.

const getVocabularySetsMock = vi.fn(async () => ({ data: [], error: null }));
const getUserVocabularyMock = vi.fn(async () => ({ data: [], error: null }));
const importWordsMock = vi.fn(async () => ({ data: [], error: null, meta: {} }));

vi.mock('../services/vocabulary.service.js', () => ({
  getVocabularySets: (...a) => getVocabularySetsMock(...a),
  getUserVocabulary: (...a) => getUserVocabularyMock(...a),
  importWords: (...a) => importWordsMock(...a),
}));

vi.mock('../services/auth.service.js', () => ({
  authService: {
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    getSession: async () => ({ data: { session: null }, error: null }),
    ensureProfile: async () => ({ data: { id: 'user-1', role: 'user' }, error: null }),
  },
}));

const USER = { id: 'user-1', email: 'user@example.com' };

function makeSet(id, name) {
  return { id, name, description: null, user_id: 'user-1', word_count: 0 };
}

function mountImport() {
  return render(
    <MemoryRouter initialEntries={['/import']}>
      <AuthProvider initialUser={USER}>
        <Import />
      </AuthProvider>
    </MemoryRouter>
  );
}

async function chooseExistingSet(view, user, setId) {
  await user.click(screen.getByLabelText('Thêm vào Word Set có sẵn'));
  const select = view.container.querySelector('select');
  await waitFor(() => {
    if (select.options.length === 0) throw new Error('no set options');
  });
  await user.selectOptions(select, setId);
  return select;
}

async function pasteAndPreview(user, text) {
  await user.type(screen.getByLabelText('Dán nội dung từ vựng'), text);
  await user.click(screen.getByRole('button', { name: 'Xem trước' }));
  await screen.findByRole('button', { name: 'Nhập từ' });
}

describe('Import — chong stale destination Set ID', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getVocabularySetsMock.mockResolvedValue({ data: [], error: null });
    getUserVocabularyMock.mockResolvedValue({ data: [], error: null });
    importWordsMock.mockResolvedValue({ data: [{ set_id: 'set-b' }], error: null, meta: { set_id: 'set-b' } });
  });
  afterEach(() => cleanup());

  it('TEST 1 — critical regression: destSetId cu bi clear khi chon tao Word Set moi, p_set_id = null, khong gui Set cu', async () => {
    const user = userEvent.setup();
    getVocabularySetsMock.mockResolvedValue({
      data: [makeSet('set-a', 'Set A'), makeSet('set-b', 'Set B')],
      error: null,
    });
    const view = mountImport();
    await chooseExistingSet(view, user, 'set-a');
    await user.click(screen.getByLabelText('Tạo Word Set mới'));
    await user.type(screen.getByPlaceholderText(/Tên Word Set mới/), 'Set B');
    await pasteAndPreview(user, 'adventure');
    await user.click(screen.getByRole('button', { name: 'Nhập từ' }));
    if (importWordsMock.mock.calls.length !== 1) throw new Error('expected exactly 1 importWords call');
    const arg = importWordsMock.mock.calls[0][0];
    if (!arg || arg.setId !== null) throw new Error('p_set_id must be null for a new Set');
    if (arg.newSetName !== 'Set B') throw new Error('newSetName must be Set B');
    if (arg.setId === 'set-a') throw new Error('stale old set id was sent');
    if (!arg.words || arg.words.length !== 1) throw new Error('expected exactly 1 word');
    if (arg.words[0].word !== 'adventure') throw new Error('expected word adventure');
  },15000);

  it('TEST 2 — existingSet: p_set_id = set da chon, p_new_set_name = null', async () => {
    const user = userEvent.setup();
    getVocabularySetsMock.mockResolvedValue({
      data: [makeSet('set-b', 'Set B')],
      error: null,
    });
    const view = mountImport();
    await chooseExistingSet(view, user, 'set-b');
    await pasteAndPreview(user, 'banana');
    await user.click(screen.getByRole('button', { name: 'Nhập từ' }));
    if (importWordsMock.mock.calls.length !== 1) throw new Error('expected exactly 1 importWords call');
    const arg = importWordsMock.mock.calls[0][0];
    if (!arg || arg.setId !== 'set-b') throw new Error('p_set_id must be set-b');
    if (arg.newSetName !== null) throw new Error('newSetName must be null');
    if (arg.words[0].word !== 'banana') throw new Error('expected word banana');
  },15000);

  it('TEST 3 — destination bi xoa sau reload: destSetId bi clear + import bi chan', async () => {
    const user = userEvent.setup();
    getVocabularySetsMock.mockResolvedValueOnce({
      data: [makeSet('set-a', 'Set A'), makeSet('set-b', 'Set B')],
      error: null,
    });
    const view = mountImport();
    await chooseExistingSet(view, user, 'set-a');
    getVocabularySetsMock.mockResolvedValueOnce({ data: [makeSet('set-b', 'Set B')], error: null });
    view.rerender(
      <MemoryRouter initialEntries={['/import']}>
        <AuthProvider initialUser={{ ...USER }}>
          <Import />
        </AuthProvider>
      </MemoryRouter>
    );
    await waitFor(() => {
      const select = view.container.querySelector('select');
      if (select.value !== '') throw new Error('destSetId must be cleared after reload');
    });
    await pasteAndPreview(user, 'pear');
    await user.click(screen.getByRole('button', { name: 'Nhập từ' }));
    if (importWordsMock.mock.calls.length !== 0) throw new Error('import must be blocked, RPC must not be called');
    await screen.findByText(/Vui lòng chọn Word Set hoặc nhập tên Word Set mới/);
  },15000);

  it('TEST 4 — import thanh cong: destSetId reset ve rong (khong tai su dung destination cu)', async () => {
    const user = userEvent.setup();
    getVocabularySetsMock.mockResolvedValue({
      data: [makeSet('set-b', 'Set B')],
      error: null,
    });
    const view = mountImport();
    const select = await chooseExistingSet(view, user, 'set-b');
    await pasteAndPreview(user, 'apple');
    await user.click(screen.getByRole('button', { name: 'Nhập từ' }));
    if (importWordsMock.mock.calls.length !== 1) throw new Error('expected exactly 1 importWords call');
    await waitFor(() => {
      if (select.value !== '') throw new Error('destSetId must reset to empty after a successful import');
    });
  },15000);
});