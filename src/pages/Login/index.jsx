  import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { authService } from '../../services/auth.service.js';
import { getAuthErrorMessage } from '../../utils/auth-errors.js';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Alert from '../../components/ui/Alert.jsx';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Biểu tượng Google (SVG inline, không cần thư viện icon ngoài). */
function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  );
}

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [googleLoading, setGoogleLoading] = useState(false);
  const navigate = useNavigate();
  const useSmartLocation = useLocation();

  const from = useSmartLocation.state?.from?.pathname || '/app';

  const handleGoogle = async () => {
    if (googleLoading) return;
    setError('');
    setResendMsg('');
    setGoogleLoading(true);
    try {
const { data, error: err } = await authService.signInWithGoogle();
      if (err) {
        if (import.meta.env.DEV) console.error('[Login] Google signIn error:', err);
        setGoogleLoading(false);
        setError(getAuthErrorMessage(err));
        return;
      }
      // `data.url` là URL Google. Với OAuth redirect (implicit/PKCE redirect flow),
      // trình duyệt sẽ được Supabase JS chuyển hướng tới Google. Ở đây ta giữ
      // googleLoading cho tới khi trang bị chuyển hướng; nếu không có url nghĩa
      // là popup flow — khi đó user tự đăng nhập và onAuthStateChange xử lý.
      if (data?.url) {
        window.location.href = data.url;
      } else {
        setGoogleLoading(false);
      }
} catch (e) {
      if (import.meta.env.DEV) console.error('[Login] Google signIn unexpected error:', e);
      setGoogleLoading(false);
      setError(getAuthErrorMessage(e));
    }
  };

  const validate = () => {
    const errors = {};
    if (!email.trim()) {
      errors.email = 'Vui lòng nhập email.';
    } else if (!EMAIL_REGEX.test(email.trim())) {
      errors.email = 'Email không hợp lệ.';
    }
    if (!password) errors.password = 'Vui lòng nhập mật khẩu.';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Chống double-submit khi đang xử lý.
    if (loading) return;

    setError('');
    setResendMsg('');

    if (!validate()) return;

    setLoading(true);
    const { data, error: err } = await authService.signIn({
      email: email.trim(),
      password,
    });
    setLoading(false);

if (err) {
      if (import.meta.env.DEV) {
        console.error('[Login] signIn error:', {
          message: err.message,
          code: err.code,
          status: err.status,
          details: err.details,
          error_code: err.error_code,
        });
      }
      setError(getAuthErrorMessage(err));
      return;
    }

    const user = data?.user;
    const confirmed =
      user?.email_confirmed_at != null || user?.confirmed_at != null;

    // Nếu đăng nhập thành công nhưng email chưa xác thực -> đăng xuất + báo
    if (data?.session && !confirmed) {
      await authService.signOut();
      setError('Email của bạn chưa được xác thực. Vui lòng kiểm tra hộp thư để xác nhận email.');
      return;
    }

    // Đăng nhập thành công -> chuyển tới trang đã định
    navigate(from, { replace: true });
  };

  const handleResend = async () => {
    // Chống spam: chặn khi đang gửi hoặc đang trong cooldown 60 giây.
    if (resending || resendCooldown > 0) return;

    setResendMsg('');
    if (!EMAIL_REGEX.test(email.trim())) {
      setError('Vui lòng nhập email hợp lệ để gửi lại email xác thực.');
      return;
    }
    setResending(true);
const { error: err } = await authService.resendConfirmation({ email: email.trim() });
    setResending(false);
    if (err) {
      if (import.meta.env.DEV) console.error('[Login] resendConfirmation error:', err);
      setError(getAuthErrorMessage(err));
      return;
    }
    setResendMsg('Đã gửi lại email xác thực. Vui lòng kiểm tra hộp thư.');
    // Bắt đầu cooldown 60 giây để không spam Supabase API.
    setResendCooldown(60);
    const timer = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-lg font-bold text-white">
            E
          </div>
          <h1 className="mt-4 text-2xl font-bold text-zinc-900">Đăng nhập</h1>
          <p className="mt-1 text-sm text-zinc-500">Chào mừng trở lại với EngFore!</p>
        </div>

        {error && <Alert type="error" message={error} className="mt-5" />}
        {resendMsg && <Alert type="success" message={resendMsg} className="mt-5" />}

        {/* Đăng nhập bằng Google */}
        <div className="mt-6">
          <button
            type="button"
            onClick={handleGoogle}
            disabled={googleLoading}
            className="flex w-full items-center justify-center gap-3 rounded-lg border border-zinc-300 bg-white px-4 py-3 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <GoogleIcon />
            {googleLoading ? 'Đang kết nối với Google...' : 'Tiếp tục với Google'}
          </button>
        </div>

        {/* Divider */}
        <div className="my-6 flex items-center gap-3">
          <span className="h-px flex-1 bg-zinc-200" />
          <span className="text-xs uppercase tracking-wide text-zinc-400">hoặc</span>
          <span className="h-px flex-1 bg-zinc-200" />
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <Input
            label="Email"
            type="email"
            name="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ban@email.com"
            autoComplete="email"
            error={fieldErrors.email}
          />
          <div>
            <Input
              label="Mật khẩu"
              type="password"
              name="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              error={fieldErrors.password}
            />
          </div>
          <Button type="submit" loading={loading} className="w-full" size="lg">
            {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </Button>
        </form>

        <button
          type="button"
          onClick={handleResend}
          disabled={resending || resendCooldown > 0}
          className="mt-3 w-full text-center text-sm font-medium text-indigo-600 hover:text-indigo-700 disabled:cursor-not-allowed disabled:text-zinc-400"
        >
          {resending
            ? 'Đang gửi lại email xác thực...'
            : resendCooldown > 0
            ? `Gửi lại email xác thực (${resendCooldown}s)`
            : 'Gửi lại email xác thực'}
        </button>

        <p className="mt-6 text-center text-sm text-zinc-500">
          Chưa có tài khoản?{' '}
          <Link to="/register" className="font-medium text-indigo-600 hover:text-indigo-700">
            Đăng ký ngay
          </Link>
</p>
      </div>
    </div>
  );
}
