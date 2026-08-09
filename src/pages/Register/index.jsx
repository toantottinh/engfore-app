import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authService } from '../../services/auth.service.js';
import { getAuthErrorMessage } from '../../utils/auth-errors.js';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Alert from '../../components/ui/Alert.jsx';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Register() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [success, setSuccess] = useState('');
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const navigate = useNavigate();

  const validate = () => {
    const errors = {};
    if (!username.trim()) errors.username = 'Vui lòng nhập tên người dùng.';
    if (!email.trim()) {
      errors.email = 'Vui lòng nhập email.';
    } else if (!EMAIL_REGEX.test(email.trim())) {
      errors.email = 'Email không hợp lệ.';
    }
    if (!password) {
      errors.password = 'Vui lòng nhập mật khẩu.';
    } else if (password.length < 6) {
      errors.password = 'Mật khẩu phải có ít nhất 6 ký tự.';
    }
    if (!confirm) {
      errors.confirm = 'Vui lòng nhập lại mật khẩu.';
    } else if (password !== confirm) {
      errors.confirm = 'Mật khẩu xác nhận không khớp.';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Chống double-submit / gửi request trùng khi đang loading.
    if (loading) return;

    setError('');
    setSuccess('');

    if (!validate()) return;

    setLoading(true);
    const { data, error: err } = await authService.signUp({
      email: email.trim(),
      password,
      username: username.trim(),
    });
    setLoading(false);

    if (err) {
      // Log lỗi thật trong development để dễ debug.
      console.error('[Register] signUp error:', {
        message: err.message,
        code: err.code,
        status: err.status,
        details: err.details,
        error_code: err.error_code,
      });
      setError(getAuthErrorMessage(err));
      return;
    }

    // Kiểm tra email confirmation
    const confirmed =
      data?.session != null ||
      data?.user?.email_confirmed_at != null ||
      data?.user?.confirmed_at != null;

    if (data?.user && !confirmed) {
      setSuccess(
        'Đăng ký thành công! Vui lòng kiểm tra email để xác thực tài khoản trước khi đăng nhập.'
      );
      setNeedsConfirmation(true);
      setUsername('');
      setPassword('');
      setConfirm('');
    } else {
      setSuccess('Đăng ký thành công! Bạn có thể đăng nhập ngay bây giờ.');
      setNeedsConfirmation(false);
    }
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
      console.error('[Register] resendConfirmation error:', err);
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

  // Màn hình xác nhận email thành công
  if (needsConfirmation) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12">
        <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-2xl">
            📧
          </div>
          <h2 className="mt-4 text-2xl font-bold text-zinc-900">Đăng ký thành công!</h2>
          <p className="mt-3 text-sm leading-relaxed text-zinc-600">
            Vui lòng kiểm tra hộp thư <strong>{email}</strong> để xác thực tài khoản
            trước khi đăng nhập.
          </p>
          {resendMsg && <Alert type="success" message={resendMsg} className="mt-4" />}
          <div className="mt-6 flex flex-col gap-3">
            <Button variant="primary" className="w-full" onClick={() => navigate('/login', { replace: true })}>
              Đăng nhập
            </Button>
            <Button
              variant="secondary"
              className="w-full"
              onClick={handleResend}
              disabled={resending || resendCooldown > 0}
            >
              {resending
                ? 'Đang gửi lại email xác thực...'
                : resendCooldown > 0
                ? `Gửi lại email xác thực (${resendCooldown}s)`
                : 'Gửi lại email xác thực'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-lg font-bold text-white">
            E
          </div>
          <h1 className="mt-4 text-2xl font-bold text-zinc-900">Tạo tài khoản</h1>
          <p className="mt-1 text-sm text-zinc-500">Bắt đầu hành trình học từ vựng cùng EngFore.</p>
        </div>

        {error && <Alert type="error" message={error} className="mt-5" />}
        {success && <Alert type="success" message={success} className="mt-5" />}

        <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
          <Input
            label="Tên người dùng"
            name="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Tên hiển thị của bạn"
            autoComplete="username"
            error={fieldErrors.username}
          />
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
          <Input
            label="Mật khẩu"
            type="password"
            name="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Ít nhất 6 ký tự"
            autoComplete="new-password"
            error={fieldErrors.password}
          />
          <Input
            label="Xác nhận mật khẩu"
            type="password"
            name="confirm"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Nhập lại mật khẩu"
            autoComplete="new-password"
            error={fieldErrors.confirm}
          />
          <Button type="submit" loading={loading} className="w-full" size="lg">
            {loading ? 'Đang tạo tài khoản...' : 'Đăng ký'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-500">
          Đã có tài khoản?{' '}
          <Link to="/login" className="font-medium text-indigo-600 hover:text-indigo-700">
            Đăng nhập
          </Link>
</p>
      </div>
    </div>
  );
}
