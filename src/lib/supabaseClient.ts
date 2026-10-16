import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Project credentials for sjkxawsbtxgxwemusash (Rakshika_Ai)
const SUPABASE_URL = 
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SUPABASE_URL) || 
  "https://sjkxawsbtxgxwemusash.supabase.co";

const SUPABASE_ANON_KEY = 
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SUPABASE_ANON_KEY) || 
  "sb_publishable_Do65HcllLSNubvCdLkFTPg_nfJKuDNk";

let clientInstance: SupabaseClient | null = null;

export function getClientSupabase(): SupabaseClient {
  if (!clientInstance) {
    clientInstance = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    });
  }
  return clientInstance;
}

export const supabase = getClientSupabase();
