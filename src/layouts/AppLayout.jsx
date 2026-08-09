import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';
import { authService } from '../services/auth.service.js';
import { getDueReviewWordsCount } from '../services/learning.service.js';

const navItems = [
{ to: '/app', label: 'Tổng quan', icon: '📊', end: true },
  { to: '/vocabulary', label: 'Từ vựng', icon: '📚' },
  { to: '/import', label: 'Nhập từ', icon: '📥' },
  { to: '/practice', label: 'Luyện tập', icon: '✏️' },
  { to: '/review', label: 'Ôn tập', icon: '🔄' },
  { to: '/profile', label: 'Hồ sơ', icon: '👤' },
];

/**
 * Layout ứng dụng (sau khi đăng nhập).
 * Desktop: Sidebar + Main. Mobile: top bar + drawer.
 */
export default function AppLayout() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dueCount, setDueCount] = useState(0);

  useEffect(() => {
    let active = true;
    if (!user) {
      setDueCount(0);
      return;
    }
    getDueReviewWordsCount(user.id).then(({ count }) => {
      if (active) setDueCount(count ?? 0);
    });
    return () => {
      active = false;
    };
  }, [user]);

  const handleLogout = async () => {
    // Đăng xuất qua authService (Supabase auth.signOut) — clear session đúng cách.
    // KHÔNG dùng window.location (full-page) vì sẽ bị Vite serve file legacy
    // login.html/login.js ở root, thay vì route React /login.
    await authService.signOut();
    // Điều hướng client-side bằng React Router — luôn về route React /login.
    navigate('/login', { replace: true });
  };

  const displayName = profile?.username || user?.email?.split('@')[0] || 'Người dùng';

  const sidebarContent = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-2 border-b border-zinc-200 px-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
          E
        </span>
        <span className="text-lg font-bold text-indigo-600">EngFore</span>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
              }`
            }
          >
            <span aria-hidden="true">{item.icon}</span>
            <span className="flex-1">{item.label}</span>
            {item.to === '/review' && dueCount > 0 && (
              <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-indigo-600 px-1.5 py-0.5 text-xs font-semibold text-white">
                {dueCount > 99 ? '99+' : dueCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-zinc-200 p-3">
        <div className="flex items-center gap-3 rounded-lg px-3 py-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700">
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-zinc-800">{displayName}</p>
            <p className="truncate text-xs text-zinc-500">{user?.email}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="mt-2 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
        >
          <span aria-hidden="true">🚪</span>
          Đăng xuất
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-50">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-zinc-200 bg-white md:block">
        {sidebarContent}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute left-0 top-0 h-full w-64 bg-white shadow-xl">
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="flex h-14 items-center justify-between border-b border-zinc-200 bg-white px-4 md:hidden">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-xs font-bold text-white">
              E
            </span>
            <span className="text-base font-bold text-indigo-600">EngFore</span>
          </div>
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-md p-2 text-zinc-600 hover:bg-zinc-100"
            aria-label="Mở menu"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
