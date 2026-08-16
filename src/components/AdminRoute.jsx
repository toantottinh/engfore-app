import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';
import Spinner from './ui/Spinner.jsx';

/**
 * Protects routes that require admin privileges.
 * If the user is not an admin, it redirects to the main app page.
 */
export default function AdminRoute() {
  const { user, isAdmin, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!user || !isAdmin) {
    return <Navigate to="/app" replace />;
  }

  return <Outlet />;
}
