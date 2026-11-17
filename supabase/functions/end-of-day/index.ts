// End-of-day job. Closes finished days for each group (strikes + streak) and settles strike votes.
//
// Runs hourly from pg_cron with the service-role key (covers every timezone), and can be called by a
// signed-in member with { groupId } to settle their own group right after a statement or vote.
// All decisions come from the shared, unit-tested domain module; this file only loads and writes.
// Every write is idempotent, so overlapping runs are safe.
import {
  addDays,
  localDate,
  MAX_CATCH_UP_DAYS,
  settle,
  type Checkin,
  type Group,
  type Schedule,
  type Strike,
  type Task,
  type Vote,
} from '../_shared/domain/index.ts';
import { admin, caller, cors, json, push } from '../_shared/supabase.ts';

declare const Deno: { serve(handler: (req: Request) => Response | Promise<Response>): void };

const hhmm = (t: string) => t.slice(0, 5);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const who = await caller(req);
  if (!who) return json({ error: 'unauthorized' }, 401);

  const db = admin();
  const body = await req.json().catch(() => ({}));
  let groupIds: string[];

  if (who.kind === 'user') {
    const { data: m } = await db
      .from('memberships').select('group_id')
      .eq('group_id', body.groupId ?? '').eq('user_id', who.id).is('left_at', null).maybeSingle();
    if (!m) return json({ error: 'not a member of that group' }, 403);
    groupIds = [m.group_id];
  } else {
    const { data } = await db.from('groups').select('id');
    groupIds = (data ?? []).map((g) => g.id);
  }

  const now = Date.now();
  const results = [];
  for (const id of groupIds) {
    try {
      results.push(await processGroup(id, now));
    } catch (e) {
      console.error('group failed', id, e);
      results.push({ groupId: id, error: String(e) });
    }
  }
  return json({ processed: results.length, results });
});

async function processGroup(groupId: string, now: number) {
  const db = admin();
  const since = addDays(localDate(now, 'UTC'), -MAX_CATCH_UP_DAYS - 8);
  const [{ data: g }, { data: memberRows }, { data: taskRows }, { data: checkinRows }, { data: strikeRows }] =
    await Promise.all([
      db.from('groups').select('*').eq('id', groupId).single(),
      db.from('memberships').select('user_id, profiles(timezone, push_token)').eq('group_id', groupId).is('left_at', null),
      db.from('tasks').select('*').eq('group_id', groupId),
      db.from('checkins').select('*').eq('group_id', groupId).gte('date', since),
      db.from('strikes').select('*').eq('group_id', groupId).gte('date', since),
    ]);
  if (!g || !memberRows || memberRows.length === 0) return { groupId, closed: 0, settled: 0 };

  const members = memberRows.map((m: any) => ({
    id: m.user_id as string,
    timezone: (m.profiles?.timezone ?? 'UTC') as string,
    pushToken: (m.profiles?.push_token ?? '') as string,
  }));
  const group: Group = {
    id: g.id, name: g.name, forfeit: g.forfeit, inviteCode: g.invite_code, currentStreak: g.current_streak,
    bestStreak: g.best_streak, lastClosedDate: g.last_closed_date, createdAt: g.created_at,
  };
  const tasks: Task[] = (taskRows ?? []).map((t: any) => ({
    id: t.id, groupId: t.group_id, ownerId: t.owner_id, creatorId: t.creator_id ?? t.owner_id,
    title: t.title, schedule: t.schedule as Schedule, windowStart: hhmm(t.window_start),
    windowEnd: hhmm(t.window_end), status: t.status, activeFrom: t.active_from, createdAt: t.created_at,
  }));
  const checkins: Checkin[] = (checkinRows ?? []).map((c: any) => ({
    id: c.id, taskId: c.task_id, groupId: c.group_id, ownerId: c.owner_id, date: c.date,
    photoPath: c.photo_path, explanation: c.explanation, status: c.status, createdAt: c.created_at,
  }));
  const strikes: Strike[] = (strikeRows ?? []).map((s: any) => ({
    id: s.id, groupId: s.group_id, userId: s.user_id, date: s.date, statement: s.statement,
    statementAt: s.statement_at, outcome: s.outcome, resolvedAt: s.resolved_at, createdAt: s.created_at,
  }));
  const pendingIds = strikes.filter((s) => s.outcome === 'pending').map((s) => s.id);
  const { data: voteRows } = pendingIds.length
    ? await db.from('votes').select('*').in('strike_id', pendingIds)
    : { data: [] as any[] };
  const votes: Vote[] = (voteRows ?? []).map((v: any) => ({ strikeId: v.strike_id, voterId: v.voter_id, choice: v.choice }));

  const result = settle({ group, members, tasks, checkins, strikes, votes, now, newId: () => crypto.randomUUID() });

  // Write the result. Each write is conditional, so two overlapping runs cannot double-apply.
  if (result.newStrikes.length > 0) {
    await db.from('strikes').upsert(
      result.newStrikes.map((s) => ({ id: s.id, group_id: groupId, user_id: s.userId, date: s.date })),
      { onConflict: 'group_id,user_id,date', ignoreDuplicates: true },
    );
    await push(result.newStrikes.map((s) => ({
      to: members.find((m) => m.id === s.userId)?.pushToken ?? '',
      title: 'You got a strike',
      body: `You missed ${s.date}. You have 24 hours to tell ${group.name} why.`,
      data: { groupId },
    })));
  }
  let settled = 0;
  for (const o of result.outcomes) {
    const { data: updated } = await db.from('strikes')
      .update({ outcome: o.outcome, resolved_at: new Date(now).toISOString() })
      .eq('id', o.strikeId).eq('outcome', 'pending').select('id');
    if (updated && updated.length > 0) settled++;
  }
  if (result.closedDates.length > 0 || result.streakBroken) {
    await db.from('groups').update({
      current_streak: result.group.currentStreak,
      best_streak: result.group.bestStreak,
      last_closed_date: result.group.lastClosedDate,
    }).eq('id', groupId);
  }
  if (result.streakBroken) {
    await push(members.map((m) => ({
      to: m.pushToken,
      title: `${group.name}: the streak is broken`,
      body: 'A third strike was upheld this week. Start again today.',
      data: { groupId },
    })));
  }
  return { groupId, closed: result.closedDates.length, settled, streak: result.group.currentStreak };
}
