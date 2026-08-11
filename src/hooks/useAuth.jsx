import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { authService } from '../services/auth.service.js';
import { useNavigate } from 'react-router-dom';

const AuthContext = createContext(null);

/**
 * Provider quản lý trạng thái xác thực toàn cục.
 * Duy trì session khi refresh và lắng nghe thay đổi auth.
 */
export function AuthProvider({ children, initialUser, initialSession }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;

    const loadSession = async () => {
      // Test seam: if an initial session/user is provided, use it synchronously
      if (initialSession !== undefined || initialUser !== undefined) {
        if (!mounted) return;
        setSession(initialSession ?? null);
        setUser(initialSession?.user ?? initialUser ?? null);
        setLoading(false);
        return;
      }

      try {
        const { data } = await authService.getSession();
        if (!mounted) return;
        setSession(data.session);
        setUser(data.session?.user ?? null);
      } catch (err) {
        if (mounted && import.meta.env.DEV) {
          console.error('Lỗi khi tải session:', err);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadSession();

    const {
      data: { subscription },
    } = authService.onAuthStateChange((_event, newSession) => {
      if (!mounted) return;
      setSession(newSession);
      setUser(newSession?.user ?? null);
    });

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, [initialUser, initialSession]);

  // Tự động tạo/đồng bộ profile khi có user
  useEffect(() => {
    let mounted = true;
    if (user) {
      authService
        .ensureProfile(user)
        .then(({ data }) => {
          if (mounted && data) setProfile(data);
        })
.catch((err) => {
          if (mounted && import.meta.env.DEV) console.error('Lỗi khi đồng bộ profile:', err);
        });
    } else {
      setProfile(null);
    }
    return () => {
      mounted = false;
    };
  }, [user]);

  const signOut = useCallback(async () => {
    await authService.signOut();
    navigate('/login', { replace: true });
  }, [navigate]);

  const value = {
    user,
    session,
    profile,
    loading,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook truy cập trạng thái xác thực.
 */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth phải được dùng bên trong AuthProvider.');
  }
  return ctx;
}

/** Hook rút gọn để đăng xuất. */
export function useLogout() {
  return useCallback(async () => {
    await authService.signOut();
  }, []);
}
