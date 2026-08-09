import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth.jsx';
import { authService } from '../../services/auth.service.js';
import { getAuthErrorMessage } from '../../utils/auth-errors.js';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Alert from '../../components/ui/Alert.jsx';

export default function Profile() {
  const { user, profile } = useAuth();
  const [username, setUsername] = useState(profile?.username || '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const displayName = profile?.username || user?.email?.split('@')[0] || 'Người dùng';

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    if (!user) return;
    if (!username.trim()) {
      setError('Vui lòng nhập tên người dùng.');
      return;
    }
    setSaving(true);
    const { error: err } = await authService.updateProfile(user.id, {
      username: username.trim(),
    });
    setSaving(false);
    if (err) {
      setError(getAuthErrorMessage(err));
    } else {
      setMessage('Đã cập nhật hồ sơ thành công.');
      setUsername(username.trim());
    }
  };

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900">Hồ sơ</h1>
        <p className="mt-1 text-sm text-zinc-500">Quản lý thông tin tài khoản của bạn.</p>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-6">
        <div className="mb-6 flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100 text-2xl font-bold text-indigo-700">
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-lg font-semibold text-zinc-900">{displayName}</p>
            <p className="text-sm text-zinc-500">{user?.email}</p>
          </div>
        </div>

        {error && <Alert type="error" message={error} className="mb-4" />}
        {message && <Alert type="success" message={message} className="mb-4" />}

        <form onSubmit={handleSave} className="space-y-4">
          <Input
            label="Tên người dùng"
            name="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Tên hiển thị"
          />
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button type="submit" loading={saving}>
              {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
