import { createClient } from '@supabase/supabase-js';

// Client Supabase duy nhất cho toàn bộ ứng dụng.
// Chỉ sử dụng anon/publishable key (KHÔNG dùng service_role trong frontend).
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Thiếu cấu hình Supabase. Vui lòng kiểm tra file .env (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY).'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

