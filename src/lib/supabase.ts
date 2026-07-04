import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();

const isConfigured = Boolean(supabaseUrl && supabaseAnonKey);
const memoryStorage = new Map<string, string>();

const authStorage = {
  getItem(key: string) {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }

    return memoryStorage.get(key) ?? null;
  },
  setItem(key: string, value: string) {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
      return;
    }

    memoryStorage.set(key, value);
  },
  removeItem(key: string) {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
      return;
    }

    memoryStorage.delete(key);
  },
};

export const supabase = isConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: false,
        persistSession: true,
        storage: authStorage,
      },
    })
  : null;

export const isSupabaseConfigured = isConfigured;
