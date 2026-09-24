import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith('sb_publishable_') || value.startsWith('sb_secret_');
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    // New Supabase API keys are opaque strings, not bearer JWTs.
    if (isNewSupabaseApiKey(supabaseKey) && headers.get('Authorization') === `Bearer ${supabaseKey}`) {
      headers.delete('Authorization');
    }

    headers.set('apikey', supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

const DEFAULT_SUPABASE_URL = "https://hqsumtwagvlnruwtrlyt.supabase.co";
const DEFAULT_SUPABASE_KEY = "sb_publishable_-P-6-kwhN3WytBumWj_Ifw_oG67Hfeh";

function createSupabaseClient() {
  // Use import.meta.env for client-side (Vite build-time replacement)
  // Fall back to process.env for SSR (server-side rendering)
  // Fall back to project defaults if hosting environment variables are not yet configured
  const SUPABASE_URL =
    import.meta.env['VITE_SUPABASE_URL'] ||
    import.meta.env['NEXT_PUBLIC_SUPABASE_URL'] ||
    process.env['SUPABASE_URL'] ||
    process.env['NEXT_PUBLIC_SUPABASE_URL'] ||
    DEFAULT_SUPABASE_URL;

  const SUPABASE_PUBLISHABLE_KEY =
    import.meta.env['VITE_SUPABASE_PUBLISHABLE_KEY'] ||
    import.meta.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'] ||
    process.env['SUPABASE_PUBLISHABLE_KEY'] ||
    process.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'] ||
    DEFAULT_SUPABASE_KEY;

  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: {
      fetch: createSupabaseFetch(SUPABASE_PUBLISHABLE_KEY),
    },
    auth: {
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

let _supabase: ReturnType<typeof createSupabaseClient> | undefined;

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";
export const supabase = new Proxy({} as ReturnType<typeof createSupabaseClient>, {
  get(_, prop, receiver) {
    if (!_supabase) _supabase = createSupabaseClient();
    return Reflect.get(_supabase, prop, receiver);
  },
});
