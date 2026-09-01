import React, { useState, useEffect } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { getDueReviewWordsCount } from './services/learning.service.js'; // Giả sử đường dẫn này đúng

const NavItem = ({ to, children, end = true }) => (
  <li>
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
          isActive
            ? 'bg-brand-primary/10 text-brand-primary'
            : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
        }`
      }
    >
      {children}
    </NavLink>
  </li>
);

const DropdownMenu = () => {
  return (
    <li className="group relative">
      <a
        href="#"
        onClick={(e) => e.preventDefault()}
        className="flex cursor-default items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-text-secondary transition-colors group-hover:bg-surface-hover group-hover:text-text-primary"
      >
        <span>Từ vựng</span>
        <i className="bx bx-chevron-down text-base transition-transform group-hover:rotate-180"></i>
      </a>
      <div className="absolute top-full left-0 z-20 mt-2 w-56 origin-top-left scale-95 rounded-lg border border-border-color bg-surface-sidebar p-2 opacity-0 shadow-lg transition-all duration-200 ease-in-out group-hover:scale-100 group-hover:opacity-100">
        <ul className="space-y-1">
          <li>
            <Link
              to="/vocabulary"
              className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-text-secondary hover:bg-brand-primary hover:text-white"
            >
              <i className="bx bxs-folder text-lg"></i>
              <span>Bộ từ</span>
            </Link>
          </li>
          <li>
            <Link
              to="/import"
              className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-text-secondary hover:bg-brand-primary hover:text-white"
            >
              <i className="bx bx-plus-circle text-lg"></i>
              <span>Thêm từ mới</span>
            </Link>
          </li>
          <li>
            <Link
              to="/practice"
              className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-text-secondary hover:bg-brand-primary hover:text-white"
            >
              <i className="bx bxs-keyboard text-lg"></i>
              <span>Luyện tập</span>
            </Link>
          </li>
        </ul>
      </div>
    </li>
  );
};

const UserProfile = () => {
  const { user, signOut } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const username = user?.user_metadata?.username || 'User';
  const avatarInitial = username.charAt(0).toUpperCase();

  return (
    <div className="relative">
      <button
        onClick={() => setDropdownOpen(!dropdownOpen)}
        className="flex items-center gap-3 rounded-full focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2 focus:ring-offset-surface-sidebar"
      >
        <div className="grid h-9 w-9 place-items-center rounded-full bg-surface-hover text-base font-semibold text-text-primary">
          {avatarInitial}
        </div>
        <span className="hidden text-sm font-medium text-text-primary md:block">{username}</span>
      </button>

      {dropdownOpen && (
        <div className="absolute top-full right-0 z-20 mt-2 w-48 origin-top-right rounded-lg border border-border-color bg-surface-sidebar py-1 shadow-lg">
          <Link
            to="/profile"
            onClick={() => setDropdownOpen(false)}
            className="block px-4 py-2 text-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary"
          >
            Hồ sơ
          </Link>
          <button
            onClick={signOut}
            className="block w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-surface-hover hover:text-red-300"
          >
            Đăng xuất
          </button>
        </div>
      )}
    </div>
  );
};

export default function Topbar() {
  const { user, isAdmin } = useAuth();
  const [reviewCount, setReviewCount] = useState(0);

  useEffect(() => {
    if (!user) {
      setReviewCount(0);
      return;
    }

    let isActive = true;
    getDueReviewWordsCount(user.id).then(({ count }) => {
      if (isActive) {
        setReviewCount(count ?? 0);
      }
    });

    return () => {
      isActive = false;
    };
  }, [user]);

  return (
    <header className="sticky top-0 z-50 flex h-16 items-center justify-between border-b border-border-color bg-surface-sidebar px-6">
      {/* Left: Logo */}
      <div className="flex items-center">
        <Link to="/app" className="flex items-center gap-3 text-xl font-bold text-text-primary">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-primary font-bold">E</span>
          <span className="hidden sm:inline">EngFore</span>
        </Link>
      </div>

      {/* Center: Navigation */}
      <nav className="hidden lg:block">
        <ul className="flex items-center gap-2">
          <NavItem to="/app">Trang chủ</NavItem>
          <NavItem to="/vocabulary" end={false}>Từ vựng</NavItem>
          <NavItem to="/structures" end={false}>
            <span className="flex items-center gap-2">
              <span>Cấu trúc câu</span>
            </span>
          </NavItem>
          <NavItem to="/learn" end={false}>
            <div className="relative flex items-center gap-2">
              <span>Học ngắt quãng</span>
              {reviewCount > 0 && (
                <span className="grid min-w-[20px] h-5 place-items-center rounded-full bg-orange-500 px-1.5 text-xs font-bold text-white">
                  {reviewCount}
                </span>
              )}
            </div>
          </NavItem>
          <NavItem to="/grammar" end={false}>Ngữ pháp</NavItem>
          {isAdmin && <NavItem to="/admin">Admin</NavItem>}
        </ul>
      </nav>

      {/* Right: Actions & Profile */}
      <div className="flex items-center gap-4">
        <div className="relative hidden md:block">
          <i className="bx bx-search absolute left-3 top-1/2 -translate-y-1/2 text-lg text-text-secondary"></i>
          <input
            type="text"
            placeholder="Tìm kiếm từ vựng..."
            className="h-9 w-64 rounded-md border border-border-color bg-surface-default py-2 pl-10 pr-4 text-sm text-text-primary placeholder-text-secondary transition-colors focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/50"
          />
        </div>
        <UserProfile />
      </div>
    </header>
  );
}