import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// Cấu hình kết nối Supabase Cloud (project: engfore)
// Chỉ sử dụng anon/publishable key cho frontend - KHÔNG hard-code service_role key.
const SUPABASE_URL = 'https://yyfllitihktyrvjssyek.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5ZmxsaXRpaGt0eXJ2anNzeWVrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwNDQ1MjcsImV4cCI6MjEwMDYyMDUyN30.PVUKOJ6asq7NZBTM3euQzwNH19zcGic9dESGAokK87A';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// TODO: Thay thế bằng VAPID Public Key của bạn
export const VAPID_PUBLIC_KEY = '64423ae5a83c9e1ab4d6094ee0b6d0a9444ed92a7e20638f8cb3c08427ac22ef';
