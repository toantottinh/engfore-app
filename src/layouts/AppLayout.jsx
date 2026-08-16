import React from 'react';
import { Outlet, Link } from 'react-router-dom';
import Topbar from '../Topbar.jsx';
import { useAuth } from '../hooks/useAuth.jsx';

/**
 * Layout ứng dụng (sau khi đăng nhập).
 * Cấu trúc: Topbar cố định + Nội dung chính.
 */
export default function AppLayout() {
  // const { isAdmin } = useAuth(); // isAdmin is now used in Topbar

  return (
    <div className="min-h-screen bg-surface-default text-text-primary">
      <Topbar />
      <main className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
        <Outlet />
      </main>
    </div>
  );
}
