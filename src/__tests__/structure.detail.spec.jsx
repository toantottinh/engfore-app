import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import StructureDetail from '../pages/Structures/StructureDetail.jsx';
import { AuthProvider } from '../hooks/useAuth.jsx';

// ------------------------------------------------------------------
// Tests cho Structure Detail (CHECKPOINT 4) — read-only.
// ------------------------------------------------------------------

const getStructureByIdMock = vi.fn();

vi.mock('../services/auth.service.js', () => ({
  authService: {
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    getSession: async () => ({ data: { session: null }, error: null }),
    ensureProfile: async () => ({ data: null, error: null }),
  },
}));

vi.mock('../services/structure.service.js', () => ({
  getStructureById: (...args) => getStructureByIdMock(...args),
}));

const USER = { id: 'user-1', email: 'test@example.com' };

const STRUCTURE = {
  id: 's1',
  pattern: 'I want to + V',
  meaning: 'Tôi muốn...',
  explanation: 'Dùng để nói về mong muốn.',
  cefr: 'A1',
  topic: 'Daily Life',
  examples: [
    { id: 'e1', sentence: 'I want to learn English.', translation: 'Tôi muốn học tiếng Anh.' },
    { id: 'e2', sentence: 'I want to go home.', translation: 'Tôi muốn về nhà.' },
  ],
  exercise_count: 5,
  exercise_types: ['multiple_choice', 'fill_blank'],
  user_structures: { state: 'learning', mastery_level: 2 },
};

function mountDetail(id = 's1') {
  return render(
    <MemoryRouter initialEntries={[`/structures/${id}`]}>
      <AuthProvider initialUser={USER}>
        <Routes>
          <Route path="/structures/:structureId" element={<StructureDetail />} />
          <Route path="/structures" element={<div>LIBRARY PAGE</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('Structure Detail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => cleanup());

  it('render loading trước khi data về', () => {
    getStructureByIdMock.mockImplementation(() => new Promise(() => {}));
    mountDetail();
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('render pattern + meaning + explanation', async () => {
    getStructureByIdMock.mockResolvedValue({ data: STRUCTURE, error: null });
    mountDetail();
    expect(await screen.findByText('I want to + V')).toBeTruthy();
    expect(screen.getByText('Tôi muốn...')).toBeTruthy();
    expect(screen.getByText('Dùng để nói về mong muốn.')).toBeTruthy();
  });

  it('render CEFR + topic', async () => {
    getStructureByIdMock.mockResolvedValue({ data: STRUCTURE, error: null });
    mountDetail();
    await screen.findByText('I want to + V');
    expect(screen.getAllByText('A1').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Daily Life').length).toBeGreaterThan(0);
  });

  it('render examples (sentence + translation)', async () => {
    getStructureByIdMock.mockResolvedValue({ data: STRUCTURE, error: null });
    mountDetail();
    await screen.findByText('I want to + V');
    expect(screen.getByText('I want to learn English.')).toBeTruthy();
    expect(screen.getByText('Tôi muốn học tiếng Anh.')).toBeTruthy();
    expect(screen.getByText('I want to go home.')).toBeTruthy();
  });

  it('render exercise metadata (count + types)', async () => {
    getStructureByIdMock.mockResolvedValue({ data: STRUCTURE, error: null });
    mountDetail();
    await screen.findByText('I want to + V');
    expect(screen.getByText(/Bài tập: 5/)).toBeTruthy();
    expect(screen.getByText('(multiple_choice, fill_blank)')).toBeTruthy();
  });

  it('render user status (learning -> Đang học)', async () => {
    getStructureByIdMock.mockResolvedValue({ data: STRUCTURE, error: null });
    mountDetail();
    await screen.findByText('I want to + V');
    expect(screen.getByText(/Đang học/)).toBeTruthy();
  });

  it('no examples -> thông báo phù hợp (không error)', async () => {
    getStructureByIdMock.mockResolvedValue({
      data: { ...STRUCTURE, examples: [] },
      error: null,
    });
    mountDetail();
    await screen.findByText('I want to + V');
    expect(screen.getByText('Chưa có ví dụ cho cấu trúc này.')).toBeTruthy();
  });

  it('không tìm thấy -> error state + nút về thư viện', async () => {
    getStructureByIdMock.mockResolvedValue({
      data: null,
      error: { message: 'Không tìm thấy cấu trúc.' },
    });
    mountDetail('nope');
    expect(await screen.findByText(/Không tìm thấy cấu trúc/)).toBeTruthy();
    expect(screen.getByText('← Về thư viện')).toBeTruthy();
  });

  it('nút "Học cấu trúc này" điều hướng sang session (CP5+)', async () => {
    getStructureByIdMock.mockResolvedValue({ data: STRUCTURE, error: null });
    mountDetail();
    await screen.findByText('I want to + V');
    const learnBtn = screen.getByRole('button', { name: /Học cấu trúc này/ });
    // CP5+: nút KHÔNG còn disabled — click dẫn tới /structures/session/:id
    expect(learnBtn.disabled).toBe(false);
  });
});