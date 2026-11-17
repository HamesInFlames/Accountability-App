// End-of-day job. Closes finished days for each group (strikes + streak) and settles strike votes.
//
// Runs hourly from pg_cron with the service-role key (covers every timezone), and can be called by a
// signed-in member with { groupId } to settle their own group right after a statement or vote.
// All decisions come from the shared, unit-tested domain module; this file only loads and writes.
// Every write is idempotent, so overlapping runs are safe.
import {
  addDays,
  breaksStreak,
  closeDay,
  dateEndedForAll,
  localDate,
  resolveStrike,
  type Checkin,
  type Schedule,
  type Strike,
  type Task,
  type Vote,
} from '../_shared/domain/index.ts';
import { admin, caller, cors, json, push } from '../_shared/supabase.ts';

declare const Deno: { serve(handler: (req: Request) => Response | Promise<Response>): void };

const MAX_CATCH_UP_DAYS = 14;
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
  const [{ data: group }, { data: memberRows }, { data: taskRows }] = await Promise.all([
    db.from('groups').select('*').eq('id', groupId).single(),
    db.from('memberships').select('user_id, profiles(timezone, push_token, display_name)')
      .eq('group_id', groupId).is('left_at', null),
    db.from('tasks').select('*').eq('group_id', groupId),
  ]);
  if (!group || !memberRows || memberRows.length === 0) return { groupId, closed: 0, settled: 0 };

  const members = memberRows.map((m: any) => ({
    id: m.user_id as string,
    timezone: (m.profiles?.timezone ?? 'UTC') as string,
    pushToken: (m.profiles?.push_token ?? '') as string,
    name: (m.profiles?.display_name ?? 'A friend') as string,
  }));
  const memberIds = members.map((m) => m.id);
  const zones = members.map((m) => m.timezone);
  const tasks: Task[] = (taskRows ?? []).map((t: any) => ({
    id: t.id, groupId: t.group_id, ownerId: t.owner_id, creatorId: t.creator_id ?? t.owner_id,
    title: t.title, schedule: t.schedule as Schedule, windowStart: hhmm(t.window_start),
    windowEnd: hhmm(t.window_end), status: t.status, activeFrom: t.active_from, createdAt: t.created_at,
  }));

  // 1. Close every date that has ended for all members since the last closed date.
  let streak: number = group.current_streak;
  let best: number = group.best_streak;
  let lastClosed: string | null = group.last_closed_date;
  let date = lastClosed ? addDays(lastClosed, 1) : localDate(group.created_at, zones[0]!);
  const earliest = addDays(localDate(now, 'UTC'), -MAX_CATCH_UP_DAYS);
  if (date < earliest) date = earliest;
  let closed = 0;

  while (dateEndedForAll(date, zones, now)) {
    const { data: checkinRows } = await db.from('checkins').select('*').eq('group_id', groupId).eq('date', date);
    const checkins: Checkin[] = (checkinRows ?? []).map((c: any) => ({
      id: c.id, taskId: c.task_id, groupId: c.group_id, ownerId: c.owner_id, date: c.date,
      photoPath: c.photo_path, explanation: c.explanation, status: c.status, createdAt: c.created_at,
    }));
    const result = closeDay({ date, memberIds, tasks, checkins, streak, bestStreak: best });
    if (result.struck.length > 0) {
      await db.from('strikes').upsert(
        result.struck.map((user_id) => ({ group_id: groupId, user_id, date })),
        { onConflict: 'group_id,user_id,date', ignoreDuplicates: true },
      );
      await push(members.filter((m) => result.struck.includes(m.id)).map((m) => ({
        to: m.pushToken,
        title: 'You got a strike',
        body: `You missed ${date}. You have 24 hours to tell ${group.name} why.`,
        data: { groupId },
      })));
    }
    streak = result.streak;
    best = result.bestStreak;
    lastClosed = date;
    closed++;
    await db.from('groups')
      .update({ current_streak: streak, best_streak: best, last_closed_date: lastClosed })
      .eq('id', groupId);
    date = addDays(date, 1);
  }

  // 2. Settle pending strikes: no statement in time, a majority vote, or the vote window closing.
  const { data: strikeRows } = await db.from('strikes').select('*').eq('group_id', groupId)
    .gte('date', addDays(localDate(now, 'UTC'), -MAX_CATCH_UP_DAYS - 7));
  const strikes: Strike[] = (strikeRows ?? []).map((s: any) => ({
    id: s.id, groupId: s.group_id, userId: s.user_id, date: s.date, statement: s.statement,
    statementAt: s.statement_at, outcome: s.outcome, resolvedAt: s.resolved_at, createdAt: s.created_at,
  }));
  const pending = strikes.filter((s) => s.outcome === 'pending');
  let settled = 0;
  if (pending.length > 0) {
    const { data: voteRows } = await db.from('votes').select('*').in('strike_id', pending.map((s) => s.id));
    const votes: Vote[] = (voteRows ?? []).map((v: any) => ({ strikeId: v.strike_id, voterId: v.voter_id, choice: v.choice }));
    for (const s of pending) {
      const outcome = resolveStrike(s, votes, memberIds, now);
      if (!outcome) continue;
      const { data: updated } = await db.from('strikes')
        .update({ outcome, resolved_at: new Date(now).toISOString() })
        .eq('id', s.id).eq('outcome', 'pending').select('id');
      if (!updated || updated.length === 0) continue; // another run settled it first
      settled++;
      if (outcome === 'upheld' && breaksStreak(strikes, s)) {
        streak = 0;
        await db.from('groups').update({ current_streak: 0 }).eq('id', groupId);
        await push(members.map((m) => ({
          to: m.pushToken,
          title: `${group.name}: the streak is broken`,
          body: 'A third strike was upheld this week. Start again today.',
          data: { groupId },
        })));
      }
      s.outcome = outcome;
    }
  }
  return { groupId, closed, settled, streak };
}
