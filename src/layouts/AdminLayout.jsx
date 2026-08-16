import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';

const AdminLayout = () => {
  const getLinkClass = ({ isActive }) =>
    `px-3 py-2 rounded-md text-sm font-medium ${
      isActive
        ? 'bg-sky-100 text-sky-700'
        : 'text-zinc-600 hover:bg-zinc-100'
    }`;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900">Admin Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Manage system content including topics, sets, and words.
        </p>
      </div>
      
      <div className="mb-6 border-b border-zinc-200">
        <nav className="flex space-x-2">
          <NavLink to="/admin" end className={getLinkClass}>
            Overview
          </NavLink>
          <NavLink to="/admin/topics" className={getLinkClass}>
            Topics
          </NavLink>
          <NavLink to="/admin/sets" className={getLinkClass}>
            Sets
          </NavLink>
        </nav>
      </div>
      
      <main>
        <Outlet />
      </main>
    </div>
  );
};

export default AdminLayout;
