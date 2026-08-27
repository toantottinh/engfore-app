import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import LearnStructures from '../pages/LearnStructures/index.jsx';
import { AuthProvider } from '../hooks/useAuth.jsx';

// ------------------------------------------------------------------
// CHECKPOINT 7 (F) — Structure queue item click -> Structure Learning Session.
// UI mock CHỈ ở service boundary; hook + component chạy thật.
// ------------------------------------------------------------------

const getStructureSessionQueueMock = vi.fn();
const getStructureSrsStatsMock = vi.fn();

vi.mock('../services/structure-learning.service.js', () => ({
  getStructureSessionQueue: (...a) => getStructureSessionQueueMock(...a),
  getStructureSrsStats: (...a) => getStructureSrsStatsMock(...a),
  getUserDailyNewStructureLimit: vi.fn(async () => ({ value: 5, error: null })),
  getDailyNewStructureProgress: vi.fn(async () => ({ data: [], error: null })),
  markNewStructureIntroduced: vi.fn(async () => ({ error: null })),
}));

vi.mock('../services/auth.service.js', () => ({
  authService: {
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    getSession: async () => ({ data: { session: null }, error: null }),
    ensureProfile: async () => ({ data: null, error: null }),
  },
}));

const USER = { id: 'user-1', email: 'test@example.com' };
const YESTERDAY = new Date(Date.now() - 86400e3).toISOString();
const TOMORROW = new Date(Date.now() + 86400e3).toISOString();

// Queue đúng thứ tự service trả về: DUE -> LEARNING -> NEW.
const QUEUE = [
  {
    id: 'uuid-due',
    structureId: 'uuid-due',
    pattern: 'I want to + V',
    meaning: 'Tôi muốn...',
    cefr: 'A1',
    created_at: '2026-01-02',
    user_structures: { state: 'review', review_due_at: YESTERDAY },
  },
  {
    id: 'uuid-learning',
    structureId: 'uuid-learning',
    pattern: 'There is / There are',
    meaning: 'Có...',
    cefr: 'A2',
    created_at: '2026-01-03',
    user_structures: { state: 'learning', learning_step: 1, review_due_at: TOMORROW },
  },
  {
    id: 'uuid-new',
    structureId: 'uuid-new',
    pattern: 'I used to + V',
    meaning: 'Tôi từng...',
    cefr: 'B1',
    created_at: '2026-01-04',
    user_structures: null,
  },
];

const STATS = { total: 3, new: 1, learning: 0, relearning: 0, review: 2, again: 1, due: 1 };

function mountLearnStructures() {
  return render(
    <MemoryRouter initialEntries={['/learn/structures']}>
      <AuthProvider initialUser={USER}>
        <Routes>
          <Route path="/learn/structures" element={<LearnStructures />} />
          {/* Stub Structure Learning Session — đích của điều hướng */}
          <Route
            path="/structures/session/:structureId"
            element={<div>STRUCTURE SESSION PAGE</div>}
          />
          {/* Stub Structure Review Session (CK10) — đích của CTA "Học cấu trúc ngắt quãng" */}
          <Route path="/learn/structures/session" element={<div>STRUCTURE REVIEW PAGE</div>} />
          <Route path="/structures" element={<div>STRUCTURES LIBRARY</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('F — LearnStructures queue navigation (/learn area)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getStructureSrsStatsMock.mockResolvedValue({ data: STATS, error: null });
    getStructureSessionQueueMock.mockResolvedValue({ data: QUEUE, error: null });
  });
  afterEach(() => cleanup());

  it('render 3 nhóm DUE / LEARNING / NEW với đúng item (pattern chỉ để hiển thị)', async () => {
    mountLearnStructures();
    expect(await screen.findByText('I want to + V')).toBeTruthy();
    expect(screen.getByText('There is / There are')).toBeTruthy();
    expect(screen.getByText('I used to + V')).toBeTruthy();

    // Ba nhóm hiển thị đúng thứ tự ưu tiên.
    expect(screen.getByRole('heading', { name: /Đến hạn ôn/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Đang học/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Mới/ })).toBeTruthy();

    // Bộ đếm tổng từ getStructureSrsStats.
    await waitFor(() => expect(getStructureSrsStatsMock).toHaveBeenCalledWith(USER.id));
  });

  it('F. Click item DUE -> điều hướng sang Structure Learning Session theo structureId', async () => {
    const user = userEvent.setup();
    mountLearnStructures();
    const dueItem = await screen.findByTestId('structure-queue-item-uuid-due');
    await user.click(dueItem);
    expect(await screen.findByText('STRUCTURE SESSION PAGE')).toBeTruthy();
  });

  it('F2. Click item NEW -> cũng vào session qua structureId (không dùng pattern)', async () => {
    const user = userEvent.setup();
    mountLearnStructures();
    const newItem = await screen.findByTestId('structure-queue-item-uuid-new');
    await user.click(newItem);
    expect(await screen.findByText('STRUCTURE SESSION PAGE')).toBeTruthy();
  });

  it('Queue rỗng -> EmptyState, không crash', async () => {
    getStructureSessionQueueMock.mockResolvedValue({ data: [], error: null });
    getStructureSrsStatsMock.mockResolvedValue({
      data: { total: 0, new: 0, learning: 0, relearning: 0, review: 0, again: 0, due: 0 },
      error: null,
    });
    mountLearnStructures();
    expect(await screen.findByText(/Chưa có cấu trúc nào để học/)).toBeTruthy();
  });

  it('Service error -> Alert lỗi + không render queue', async () => {
    getStructureSessionQueueMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    mountLearnStructures();
    expect(
      await screen.findByText(/Không thể tải hàng đợi học cấu trúc/)
    ).toBeTruthy();
    expect(screen.queryByText('I want to + V')).toBeNull();
  });

  it('CK10: CTA "Học cấu trúc ngắt quãng" -> mở Review Session tự động', async () => {
    const user = userEvent.setup();
    mountLearnStructures();
    const cta = await screen.findByTestId('start-structure-review');
    expect(cta.textContent).toContain('Học cấu trúc ngắt quãng');
    await user.click(cta);
    expect(await screen.findByText('STRUCTURE REVIEW PAGE')).toBeTruthy();
  });
});

