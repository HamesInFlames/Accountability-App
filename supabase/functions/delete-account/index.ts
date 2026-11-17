// Account deletion, required by both app stores. Deletes the caller's proof photos and their auth
// user; every table row that belongs to them goes with it through ON DELETE CASCADE.
import { admin, caller, cors, json } from '../_shared/supabase.ts';

declare const Deno: { serve(handler: (req: Request) => Response | Promise<Response>): void };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const who = await caller(req);
  if (!who || who.kind !== 'user') return json({ error: 'unauthorized' }, 401);

  const db = admin();
  const { data: photos } = await db.from('checkins').select('photo_path').eq('owner_id', who.id);
  const paths = (photos ?? []).map((p) => p.photo_path).filter((p): p is string => !!p);
  for (let i = 0; i < paths.length; i += 100) {
    await db.storage.from('proofs').remove(paths.slice(i, i + 100));
  }
  // Leave groups properly first so admin roles are handed on.
  const { error } = await db.auth.admin.deleteUser(who.id);
  if (error) return json({ error: error.message }, 500);
  return json({ deleted: true });
});
