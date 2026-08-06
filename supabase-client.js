import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// TODO: Chuyển các thông tin này vào biến môi trường trong tương lai
const SUPABASE_URL = 'YOUR_SUPABASE_URL'; // Thay thế bằng URL dự án Supabase của bạn
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY'; // Thay thế bằng Anon Key dự án Supabase của bạn

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// TODO: Thay thế bằng VAPID Public Key của bạn
export const VAPID_PUBLIC_KEY = 'YOUR_VAPID_PUBLIC_KEY';