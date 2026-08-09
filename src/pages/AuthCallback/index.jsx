import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../services/supabase.js';
import { getCallbackErrorMessage } from '../../utils/auth-errors.js';
import Spinner from '../../components/ui/Spinner.jsx';
import Alert from '../../components/ui/Alert.jsx';
import Button from '../../components/ui/Button.jsx';
import { useAuth } from '../../hooks/useAuth.jsx';

/**
 * Trang xử lý callback sau khi user bấm "Confirm email address".
 * Supabase redirect về /auth/callback kèm token (hash) hoặc code (query).
 *
 * Xử lý:
 *  - error / error_code / error_description  -> hiển thị lỗi tiếng Việt
 *  - code (PKCE) -> exchangeCodeForSession
 *  - hash (token) -> detectSessionInUrl sẽ xử lý, ta chỉ cần đợi session
 *  - thành công -> thông báo + chuyển tới /login hoặc /app
 */
export default function AuthCallback() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading } = useAuth();
  const [status, setStatus] = useState('processing'); // processing | success | error
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function handleCallback() {
      try {
        // Parse query params (PKCE `code`, hoặc `error`/`error_code`)
        const params = new URLSearchParams(location.search);

        // Trường hợp lỗi từ Supabase
        const error = params.get('error');
        const errorCode = params.get('error_code');
        const errorDescription = params.get('error_description');

        if (error || errorCode) {
          if (!cancelled) {
            setStatus('error');
            setMessage(getCallbackErrorMessage(errorCode, errorDescription));
          }
          return;
        }

        // Trường hợp PKCE: có mã code -> đổi code lấy session
        const code = params.get('code');
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            console.error('[AuthCallback] exchangeCodeForSession error:', exchangeError);
            if (!cancelled) {
              setStatus('error');
              setMessage(getCallbackErrorMessage(exchangeError.error_code, exchangeError.message));
            }
            return;
          }
        }
        // Trường hợp hash token: detectSessionInUrl đã xử lý, session cập nhật qua
        // onAuthStateChange trong AuthProvider. Ta chỉ cần đợi user.

        // Nếu có session (user) -> thành công
        if (!cancelled) {
          setStatus('success');
          setMessage('Xác thực email thành công!');
        }
      } catch (e) {
        console.error('[AuthCallback] unexpected error:', e);
        if (!cancelled) {
          setStatus('error');
          setMessage('Đã xảy ra lỗi. Vui lòng thử lại.');
        }
      }
    }

    handleCallback();

    return () => {
      cancelled = true;
    };
  }, [location.search]);

  // Khi có user -> sau một nhịp, chuyển tới dashboard
  useEffect(() => {
    if (user && status === 'success') {
      const t = setTimeout(() => navigate('/app', { replace: true }), 1500);
      return () => clearTimeout(t);
    }
  }, [user, status, navigate]);

  // Nếu có lỗi -> đưa nút "Về trang đăng nhập"
  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
        {status === 'processing' ? (
          <div className="flex flex-col items-center gap-4 py-6">
            <Spinner />
            <p className="text-sm text-zinc-500">Đang xác thực tài khoản...</p>
          </div>
        ) : status === 'success' ? (
          <div>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-2xl">
              ✅
            </div>
            <h1 className="mt-4 text-xl font-bold text-zinc-900">{message}</h1>
            <p className="mt-2 text-sm text-zinc-500">Đang chuyển đến trang chính...</p>
          </div>
        ) : (
          <div>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-2xl">
              ⚠️
            </div>
            <h1 className="mt-4 text-xl font-bold text-zinc-900">
              Không thể xác thực tài khoản
            </h1>
            <div className="mt-3 text-left">
              <Alert type="error" message={message} />
            </div>
            <div className="mt-6 flex flex-col gap-2">
              <Button className="w-full" onClick={() => navigate('/login', { replace: true })}>
                Về trang đăng nhập
              </Button>
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => navigate('/register', { replace: true })}
              >
                Đăng ký lại
              </Button>
            </div>
          </div>
        )}
</div>
    </div>
  );
}
