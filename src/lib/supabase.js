import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const hasPlaceholderUrl = !url || url.includes("your-project") || url.includes("example.supabase.co");
const hasPlaceholderKey = !anonKey || anonKey.includes("your_supabase") || anonKey === "missing-key";

if (hasPlaceholderUrl || hasPlaceholderKey) {
  console.warn("Supabase env vars are missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
}

export const supabase = createClient(url || "https://example.supabase.co", anonKey || "missing-key");
export const isSupabaseConfigured = !hasPlaceholderUrl && !hasPlaceholderKey;
