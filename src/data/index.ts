import type { Backend } from './backend';
import { LocalBackend } from './local';
import { SupabaseBackend } from './supabase';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/** With Supabase keys in the environment the app is live; without them it runs the on-device demo. */
export const backend: Backend = url && key ? new SupabaseBackend(url, key) : new LocalBackend();

export * from './backend';
