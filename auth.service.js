import { supabase } from './supabase-client.js';

/**
 * Đối tượng authService chứa tất cả các phương thức liên quan đến xác thực người dùng.
 */
export const authService = {
    /**
     * Đăng ký người dùng mới.
     * @param {string} email 
     * @param {string} password 
     * @returns {Promise<{ data: any, error: Error | null }>}
     */
    signUp: (email, password) => {
        return supabase.auth.signUp({ email, password });
    },

    /**
     * Đăng nhập người dùng.
     * @param {string} email 
     * @param {string} password 
     * @returns {Promise<{ data: any, error: Error | null }>}
     */
    signIn: (email, password) => {
        return supabase.auth.signInWithPassword({ email, password });
    },

    signOut: () => supabase.auth.signOut(),

    getUser: () => supabase.auth.getUser(),
};