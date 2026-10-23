import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(url, key);
export const CURRENT_USER_ID = "16b9cbb0-2889-4bb4-b6a1-3f71eee293cf"; // Toàn (admin) demo user