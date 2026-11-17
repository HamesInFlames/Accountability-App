// Deno-only helpers for Edge Functions (not imported by the app).
// deno-lint-ignore-file no-explicit-any
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

declare const Deno: { env: { get(name: string): string | undefined } };

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

export function admin(): SupabaseClient<any> {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
}

/** Who is calling: the scheduler (service-role key), a signed-in user, or nobody. */
export async function caller(req: Request): Promise<{ kind: 'service' } | { kind: 'user'; id: string } | null> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  if (token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) return { kind: 'service' };
  const { data } = await admin().auth.getUser(token);
  return data.user ? { kind: 'user', id: data.user.id } : null;
}

/** Send Expo push notifications. Failures are logged, never thrown: a push must not fail the job. */
export async function push(messages: { to: string; title: string; body: string; data?: Record<string, unknown> }[]) {
  const valid = messages.filter((m) => m.to);
  if (valid.length === 0) return;
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(valid.map((m) => ({ sound: 'default', ...m }))),
    });
  } catch (e) {
    console.error('push failed', e);
  }
}
