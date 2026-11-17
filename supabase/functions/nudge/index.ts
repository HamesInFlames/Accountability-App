// Sends the push for a nudge. The app inserts the nudge row first (one per friend per day, enforced
// by the database); this function only delivers a push for a row that really exists.
import { admin, caller, cors, json, push } from '../_shared/supabase.ts';

declare const Deno: { serve(handler: (req: Request) => Response | Promise<Response>): void };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const who = await caller(req);
  if (!who || who.kind !== 'user') return json({ error: 'unauthorized' }, 401);
  const { nudgeId } = await req.json().catch(() => ({}));

  const db = admin();
  const { data: nudge } = await db.from('nudges').select('*').eq('id', nudgeId ?? '').eq('from_id', who.id).maybeSingle();
  if (!nudge) return json({ error: 'nudge not found' }, 404);

  const [{ data: to }, { data: from }, { data: blocked }] = await Promise.all([
    db.from('profiles').select('push_token, notify_nudges').eq('id', nudge.to_id).single(),
    db.from('profiles').select('display_name').eq('id', who.id).single(),
    db.from('blocks').select('blocker_id').eq('blocker_id', nudge.to_id).eq('blocked_id', who.id).maybeSingle(),
  ]);
  if (!to?.push_token || !to.notify_nudges || blocked) return json({ sent: false });

  await push([{
    to: to.push_token,
    title: `${from?.display_name ?? 'A friend'} nudged you`,
    body: 'Your group is waiting on your check-in.',
    data: { groupId: nudge.group_id },
  }]);
  return json({ sent: true });
});
