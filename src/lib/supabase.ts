import { createClient, SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(url && anon);

export const supabase: SupabaseClient = supabaseConfigured
  ? createClient(url!, anon!)
  : (null as unknown as SupabaseClient);
