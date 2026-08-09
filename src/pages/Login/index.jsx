import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { authService } from '../../services/auth.service.js';
import { getAuthErrorMessage } from '../../utils/auth-errors.js';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Alert from '../../components/ui/Alert.jsx';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const navigate = useNavigate();
  const useSmartLocation = useLocation();

  const from = useSmartLocation.state?.from?.pathname || '/app';

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
      console.error('[Login] signIn error:', {
        message: err.message,
        code: err.code,
        status: err.status,
        details: err.details,
        error_code: err.error_code,
      });
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
      console.error('[Login] resendConfirmation error:', err);
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

        <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
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
