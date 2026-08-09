import { supabase } from './supabase-client.js';

/**
 * Đối tượng authService chứa tất cả các phương thức liên quan đến xác thực người dùng.
 * Mọi thao tác đều đi qua Supabase Cloud với anon key (không dùng service_role).
 */
export const authService = {
    /**
     * Đăng ký người dùng mới.
     * @param {string} email
     * @param {string} password
     * @param {string} [username=''] - Tên người dùng (tùy chọn).
     * @returns {Promise<{ data: any, error: Error | null }>}
     */
    signUp: (email, password, username = '') => {
        const options = {};

        // Đảm bảo redirect về trang app sau khi xác nhận email
        options.emailRedirectTo = window.location.origin + '/login.html';

        if (username && username.trim()) {
            options.data = { username: username.trim() };
        }

        return supabase.auth.signUp({ email, password, options });
    },

    /**
     * Đăng nhập người dùng (email + mật khẩu).
     * @param {string} email
     * @param {string} password
     * @returns {Promise<{ data: any, error: Error | null }>}
     */
    signIn: (email, password) => {
        return supabase.auth.signInWithPassword({ email, password });
    },

    /**
     * Đăng xuất người dùng hiện tại.
     * @returns {Promise<{ error: Error | null }>}
     */
    signOut: () => supabase.auth.signOut(),

    /**
     * Lấy thông tin user hiện tại dựa trên session.
     * @returns {Promise<{ data: { user: any | null }, error: Error | null }>}
     */
    getUser: () => supabase.auth.getUser(),

    /**
     * Lấy session hiện tại (để duy trì đăng nhập khi refresh trang).
     * @returns {Promise<{ data: { session: any | null }, error: Error | null }>}
     */
    getSession: () => supabase.auth.getSession(),

    /**
     * Đăng ký listener theo dõi sự thay đổi trạng thái xác thực.
     * @param {Function} callback - Hàm xử lý khi có sự kiện (event, session).
     * @returns {object} subscription - Có phương thức .unsubscribe()
     */
    onAuthStateChange: (callback) => {
        return supabase.auth.onAuthStateChange(callback);
    },
};
