import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';

const tabs = [
  { name: 'Học từ vựng ngắt quãng', to: '/learn', end: true },
  // { name: 'Nghe', to: '/learn/dictation' }, // Dành cho tương lai
  // { name: 'Đọc', to: '/learn/reading' }, // Dành cho tương lai
];

const TabLink = ({ to, name, end }) => (
  <NavLink
    to={to}
    end={end}
    className={({ isActive }) =>
      `whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium ${
        isActive
          ? 'border-brand-primary text-brand-primary'
          : 'border-transparent text-text-secondary hover:border-gray-300 hover:text-text-primary'
      }`
    }
  >
    {name}
  </NavLink>
);

export default function LearnLayout() {
  return (
    <div>
      <div className="border-b border-border-color">
        <nav className="-mb-px flex space-x-8" aria-label="Tabs">
          {tabs.map((tab) => (
            <TabLink key={tab.name} {...tab} />
          ))}
        </nav>
      </div>
      <div className="py-6">
        <Outlet />
      </div>
    </div>
  );
}
