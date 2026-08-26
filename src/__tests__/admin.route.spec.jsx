import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import AdminRoute from '../components/AdminRoute.jsx';

// ------------------------------------------------------------------
// Test P — /admin vẫn là khu vực ADMIN riêng:
//   - admin  : đi qua AdminRoute vào được vùng quản trị.
//   - user   : bị redirect về /app (không thấy nội dung admin).
// Mock trực tiếp useAuth để kiểm soát isAdmin đồng bộ (không race với
// profile load bất đồng bộ của AuthProvider).
// ------------------------------------------------------------------

const USER = { id: 'user-1', email: 'test@example.com' };
let mockAuthState = { user: USER, isAdmin: true, loading: false };

vi.mock('../hooks/useAuth.jsx', () => ({
  useAuth: () => mockAuthState,
}));

function mountAdmin() {
  return render(
    <MemoryRouter initialEntries={['/admin']}>
      <Routes>
        <Route path="/admin" element={<AdminRoute />}>
          <Route index element={<div>ADMIN AREA</div>} />
        </Route>
        <Route path="/app" element={<div>APP PAGE</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('AdminRoute — /admin vẫn admin-only', () => {
  afterEach(cleanup);

  it('admin truy cập được /admin', () => {
    mockAuthState = { user: USER, isAdmin: true, loading: false };
    mountAdmin();
    expect(screen.getByText('ADMIN AREA')).toBeTruthy();
  });

  it('user thường bị redirect khỏi /admin (về /app)', () => {
    mockAuthState = { user: USER, isAdmin: false, loading: false };
    mountAdmin();
    expect(screen.getByText('APP PAGE')).toBeTruthy();
    expect(screen.queryByText('ADMIN AREA')).toBeNull();
  });

  it('chưa đăng nhập -> redirect về /app', () => {
    mockAuthState = { user: null, isAdmin: false, loading: false };
    mountAdmin();
    expect(screen.getByText('APP PAGE')).toBeTruthy();
  });
});

