import { supabase } from './supabase.js';

/**
 * Xác định URL đích để redirect sau khi xác thực email.
 * KHÔNG hard-code port. Luôn dùng origin hiện tại để chịu được
 * khi Vite chuyển port (5173 → 5174) hoặc chạy ở production.
 */
function getRedirectBase() {
  // Ưu tiên VITE_AUTH_REDIRECT_URL (cho phép ghi đè rõ ràng, ví dụ production
  // hoặc khi cần cố định URL). Nếu không, dùng VITE_APP_URL. Nếu cả hai đều
  // không có, dùng origin hiện tại của window (tự thích ứng với port 5173/5174).
  const explicit = import.meta.env.VITE_AUTH_REDIRECT_URL;
  if (explicit && /^https?:\/\//.test(explicit)) {
    return explicit.replace(/\/$/, '');
  }
  const configured = import.meta.env.VITE_APP_URL;
  if (configured && /^https?:\/\//.test(configured)) {
    return configured.replace(/\/$/, '');
  }
  return window.location.origin;
}

/**
 * Dịch vụ xác thực bằng Supabase Auth.
 * Mọi thao tác đều dùng Supabase Auth chuẩn (không mock).
 */
export const authService = {
  /**
   * Đăng ký người dùng mới.
   * @param {{ email: string, password: string, username?: string }} params
   */
  async signUp({ email, password, username }) {
    const options = {
      // Redirect về route callback riêng để xử lý session + hiển thị thông báo.
      emailRedirectTo: `${getRedirectBase()}/auth/callback`,
    };
    if (username && username.trim()) {
      options.data = { username: username.trim() };
    }
    return supabase.auth.signUp({ email, password, options });
  },

  /**
   * Đăng nhập bằng email + mật khẩu.
   */
  async signIn({ email, password }) {
    return supabase.auth.signInWithPassword({ email, password });
  },

  /**
   * Đăng xuất người dùng hiện tại.
   */
  async signOut() {
    return supabase.auth.signOut();
  },

  /**
   * Đăng nhập / đăng ký bằng Google OAuth.
   * Nếu email Google đã có tài khoản → đăng nhập vào tài khoản đó.
   * Nếu email mới → Supabase tự tạo tài khoản mới.
   * Redirect về /auth/callback (origin động) để hoạt động cả localhost lẫn Vercel.
   */
  async signInWithGoogle() {
    return supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${getRedirectBase()}/auth/callback`,
        // Truyền query param để AuthCallback biết đây là OAuth (không bắt buộc).
      },
    });
  },

  /**
   * Lấy thông tin user hiện tại.
   */
  async getUser() {
    return supabase.auth.getUser();
  },

  /**
   * Lấy session hiện tại (duy trì đăng nhập khi refresh).
   */
  async getSession() {
    return supabase.auth.getSession();
  },

  /**
   * Lắng nghe sự thay đổi trạng thái xác thực.
   */
  onAuthStateChange(callback) {
    return supabase.auth.onAuthStateChange(callback);
  },

  /**
   * Gửi lại email xác thực nếu user chưa xác thực.
   */
  async resendConfirmation({ email }) {
    return supabase.auth.resend({
      type: 'signup',
      email,
      options: {
        emailRedirectTo: `${getRedirectBase()}/auth/callback`,
      },
    });
  },

  /**
   * Lấy hồ sơ profile của user (bảng users trong schema hiện tại).
   */
  async getProfile(userId) {
    return supabase.from('users').select('*').eq('id', userId).maybeSingle();
  },

  /**
   * Cập nhật thông tin hồ sơ người dùng (bảng users).
   */
  async updateProfile(userId, updates) {
    return supabase.from('users').update(updates).eq('id', userId);
  },

  /**
   * Tạo hồ sơ profile nếu chưa tồn tại.
   */
  async ensureProfile(user) {
    if (!user) return { data: null, error: null };
    const { data: existing, error: fetchError } = await supabase
      .from('users')
      .select('id, username, role')
      .eq('id', user.id)
      .maybeSingle();
    if (fetchError && fetchError.code !== 'PGRST116') {
      return { data: null, error: fetchError };
    }
    if (existing) return { data: existing, error: null };
    const username =
      user.user_metadata?.username ||
      user.user_metadata?.full_name ||
      user.email?.split('@')[0] ||
      'người dùng';
    const { data, error } = await supabase
      .from('users')
      .insert([{ id: user.id, username }])
      .select('id, username, role')
      .maybeSingle();
return { data, error };
  },
};
