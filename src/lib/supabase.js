import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

const hasPlaceholderUrl = !url || url.includes("your-project") || url.includes("example.supabase.co");
// Supabase keys are JWTs and must start with 'ey'. If it starts with 'sb_publishable', it's the wrong provider.
const isInvalidKey = !anonKey || !anonKey.startsWith("ey");
const isPlaceholder = anonKey?.includes("your_supabase") || anonKey === "missing-key";

const isConfigured = !hasPlaceholderUrl && !isInvalidKey && !isPlaceholder;

if (!isConfigured && url && anonKey) {
  console.error("Supabase Configuration Error: Your VITE_SUPABASE_ANON_KEY format is invalid. Supabase keys must start with 'ey'. Please check your .env file.");
}

export const supabase = createClient(url || "https://example.supabase.co", anonKey || "missing-key");
export const isSupabaseConfigured = isConfigured;
