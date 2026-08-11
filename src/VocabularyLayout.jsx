import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';

const tabs = [
  { name: 'Bộ từ', to: '/vocabulary', end: true },
  { name: 'Từ mới', to: '/vocabulary/import', end: false },
  { name: 'Luyện tập', to: '/vocabulary/practice', end: false },
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

export default function VocabularyLayout() {
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