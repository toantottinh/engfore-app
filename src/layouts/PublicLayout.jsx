import React from 'react';
import { Link, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';

/**
 * Layout công khai (trang landing, đăng nhập, đăng ký).
 */
export default function PublicLayout() {
  const { user } = useAuth();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2 text-lg font-bold text-indigo-600">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
              E
            </span>
            EngFore
          </Link>
          <nav className="flex items-center gap-2">
            {user ? (
              <Link
                to="/app"
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Vào ứng dụng
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
                >
                  Đăng nhập
                </Link>
                <Link
                  to="/register"
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  Đăng ký
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-zinc-200 bg-white py-6">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-4 sm:flex-row sm:px-6">
          <p className="text-sm text-zinc-500">© 2026 EngFore. Học từ vựng không còn nhàm chán.</p>
          <div className="flex items-center gap-4 text-sm text-zinc-500">
            <Link to="/login" className="hover:text-zinc-800">
              Đăng nhập
            </Link>
            <Link to="/register" className="hover:text-zinc-800">
              Đăng ký
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
