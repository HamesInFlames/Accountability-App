import { describe, expect, it } from 'vitest';
import {
  addDays,
  breaksStreak,
  canTakeTask,
  closeDay,
  cycleEnd,
  cycleStart,
  dateEndedForAll,
  dueOn,
  firstDueDate,
  inWindow,
  localNow,
  memberDay,
  recap,
  resolveStrike,
  MAX_CATCH_UP_DAYS,
  settle,
  strikesInCycle,
  validExplanation,
  weekday,
  type Checkin,
  type GroupSnapshot,
  type Schedule,
  type Strike,
  type Task,
  type Vote,
} from '@domain';

// 2026-11-16 is a Monday.
const MON = '2026-11-16';
const members = ['a', 'b', 'c'];

let seq = 0;
function task(ownerId: string, over: Partial<Task> = {}): Task {
  return {
    id: `t${++seq}`,
    groupId: 'g',
    ownerId,
    creatorId: ownerId,
    title: 'Gym',
    schedule: { kind: 'daily' },
    windowStart: '06:00',
    windowEnd: '22:00',
    status: 'active',
    activeFrom: '2026-11-01',
    createdAt: '2026-11-01T00:00:00Z',
    ...over,
  };
}
function checkin(t: Task, date: string, status: Checkin['status'] = 'submitted'): Checkin {
  return {
    id: `c${++seq}`,
    taskId: t.id,
    groupId: 'g',
    ownerId: t.ownerId,
    date,
    photoPath: 'p.jpg',
    explanation: 'Did the full session, legs and core.',
    status,
    createdAt: `${date}T12:00:00Z`,
  };
}
function strike(userId: string, date: string, over: Partial<Strike> = {}): Strike {
  return {
    id: `s${++seq}`,
    groupId: 'g',
    userId,
    date,
    statement: null,
    statementAt: null,
    outcome: 'pending',
    resolvedAt: null,
    createdAt: `${addDays(date, 1)}T05:00:00Z`,
    ...over,
  };
}
const vote = (s: Strike, voterId: string, choice: Vote['choice']): Vote => ({ strikeId: s.id, voterId, choice });

describe('dates', () => {
  it('reads the local date and time in a timezone', () => {
    const at = Date.UTC(2026, 10, 17, 3, 30); // 03:30 UTC on the 17th
    expect(localNow(at, 'America/Toronto')).toEqual({ date: '2026-11-16', time: '22:30' });
    expect(localNow(at, 'Asia/Seoul')).toEqual({ date: '2026-11-17', time: '12:30' });
  });

  it('runs cycles Monday to Sunday', () => {
    expect(weekday(MON)).toBe(1);
    expect(cycleStart('2026-11-22')).toBe(MON); // Sunday belongs to the week that started Monday
    expect(cycleEnd(MON)).toBe('2026-11-22');
    expect(cycleStart('2026-11-23')).toBe('2026-11-23');
  });

  it('crosses month and year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('closes a date only once it has ended for every member', () => {
    const zones = ['America/Toronto', 'Asia/Seoul'];
    // 16th has ended in Seoul but it is still the 16th in Toronto.
    expect(dateEndedForAll(MON, zones, Date.UTC(2026, 10, 17, 3, 0))).toBe(false);
    // 05:00 UTC is midnight in Toronto (EST).
    expect(dateEndedForAll(MON, zones, Date.UTC(2026, 10, 17, 5, 0))).toBe(true);
  });

  it('checks the check-in window inclusively', () => {
    expect(inWindow('06:00', '06:00', '22:00')).toBe(true);
    expect(inWindow('22:00', '06:00', '22:00')).toBe(true);
    expect(inWindow('22:01', '06:00', '22:00')).toBe(false);
  });
});

describe('tasks', () => {
  it('treats unscheduled weekdays as rest days', () => {
    const gym = task('a', { schedule: { kind: 'weekdays', days: [1, 3, 5] } });
    expect(dueOn(gym, MON)).toBe(true);
    expect(dueOn(gym, addDays(MON, 1))).toBe(false);
    expect(memberDay('a', addDays(MON, 1), [gym], []).status).toBe('rest');
  });

  it('makes a dated task due only on its date', () => {
    const exam = task('a', { schedule: { kind: 'once', date: '2026-11-18' } as Schedule });
    expect(dueOn(exam, '2026-11-17')).toBe(false);
    expect(dueOn(exam, '2026-11-18')).toBe(true);
  });

  it('ignores tasks that are pending, paused, ended or not started yet', () => {
    expect(dueOn(task('a', { status: 'pending', activeFrom: null }), MON)).toBe(false);
    expect(dueOn(task('a', { status: 'paused' }), MON)).toBe(false);
    expect(dueOn(task('a', { status: 'ended' }), MON)).toBe(false);
    expect(dueOn(task('a', { activeFrom: addDays(MON, 1) }), MON)).toBe(false);
  });

  it('starts a task tomorrow when today\'s window has already closed', () => {
    expect(firstDueDate(MON, '21:00', '22:00', addDays(MON, 1))).toBe(MON);
    expect(firstDueDate(MON, '22:30', '22:00', addDays(MON, 1))).toBe(addDays(MON, 1));
  });

  it('counts unreviewed and approved check-ins but not questioned ones', () => {
    const t = task('a');
    expect(memberDay('a', MON, [t], [checkin(t, MON, 'submitted')]).status).toBe('complete');
    expect(memberDay('a', MON, [t], [checkin(t, MON, 'approved')]).status).toBe('complete');
    expect(memberDay('a', MON, [t], [checkin(t, MON, 'questioned')]).status).toBe('missed');
  });

  it('needs every due task done for a complete day', () => {
    const t1 = task('a');
    const t2 = task('a');
    expect(memberDay('a', MON, [t1, t2], [checkin(t1, MON)]).status).toBe('missed');
  });

  it('caps a person at three active tasks, counting paused but not pending', () => {
    const three = [task('a'), task('a'), task('a', { status: 'paused' })];
    expect(canTakeTask(three, 'a')).toBe(false);
    expect(canTakeTask([task('a'), task('a'), task('a', { status: 'pending' })], 'a')).toBe(true);
    expect(canTakeTask(three, 'b')).toBe(true);
  });

  it('requires a 20-character explanation after trimming', () => {
    expect(validExplanation('   done   ')).toBe(false);
    expect(validExplanation('Ran 5k along the lake.')).toBe(true);
  });
});

describe('closeDay', () => {
  const base = { date: MON, memberIds: members, streak: 4, bestStreak: 6 };

  it('grows the streak when everyone completes', () => {
    const tasks = members.map((m) => task(m));
    const r = closeDay({ ...base, tasks, checkins: tasks.map((t) => checkin(t, MON)) });
    expect(r.streak).toBe(5);
    expect(r.struck).toEqual([]);
    expect(r.bestStreak).toBe(6);
  });

  it('raises the best streak when passed', () => {
    const tasks = members.map((m) => task(m));
    const r = closeDay({ ...base, streak: 6, tasks, checkins: tasks.map((t) => checkin(t, MON)) });
    expect(r).toMatchObject({ streak: 7, bestStreak: 7 });
  });

  it('strikes whoever missed and holds the streak', () => {
    const tasks = members.map((m) => task(m));
    const r = closeDay({ ...base, tasks, checkins: [checkin(tasks[0]!, MON), checkin(tasks[1]!, MON)] });
    expect(r.struck).toEqual(['c']);
    expect(r.streak).toBe(4);
    expect(r.statuses).toEqual({ a: 'complete', b: 'complete', c: 'missed' });
  });

  it('lets a member on a rest day ride along', () => {
    const ta = task('a');
    const tb = task('b');
    const tc = task('c', { schedule: { kind: 'weekdays', days: [2] } });
    const r = closeDay({ ...base, tasks: [ta, tb, tc], checkins: [checkin(ta, MON), checkin(tb, MON)] });
    expect(r.statuses.c).toBe('rest');
    expect(r.streak).toBe(5);
  });

  it('holds the streak on a day nobody had anything due', () => {
    const r = closeDay({ ...base, tasks: [], checkins: [] });
    expect(r).toMatchObject({ streak: 4, struck: [] });
  });

  it('strikes for a questioned check-in', () => {
    const tasks = members.map((m) => task(m));
    const checkins = [checkin(tasks[0]!, MON), checkin(tasks[1]!, MON), checkin(tasks[2]!, MON, 'questioned')];
    expect(closeDay({ ...base, tasks, checkins }).struck).toEqual(['c']);
  });

  it('does not accept a check-in from another day', () => {
    const t = task('a');
    const r = closeDay({ ...base, memberIds: ['a'], tasks: [t], checkins: [checkin(t, addDays(MON, -1))] });
    expect(r.struck).toEqual(['a']);
  });
});

describe('strikes', () => {
  const h = (n: number) => n * 3_600_000;

  it('stays open inside the statement window, then is upheld without a statement', () => {
    const s = strike('c', MON);
    const made = new Date(s.createdAt).getTime();
    expect(resolveStrike(s, [], members, made + h(23))).toBeNull();
    expect(resolveStrike(s, [], members, made + h(24))).toBe('upheld');
  });

  it('is excused at once by a strict majority', () => {
    const s = strike('c', MON, { statement: 'Had the flu', statementAt: '2026-11-17T08:00:00Z' });
    const now = Date.parse('2026-11-17T09:00:00Z');
    expect(resolveStrike(s, [vote(s, 'a', 'excuse')], members, now)).toBeNull(); // 1 of 2 is not a majority
    expect(resolveStrike(s, [vote(s, 'a', 'excuse'), vote(s, 'b', 'excuse')], members, now)).toBe('excused');
  });

  it('is upheld at once by a strict majority', () => {
    const s = strike('c', MON, { statement: 'Forgot', statementAt: '2026-11-17T08:00:00Z' });
    const votes = [vote(s, 'a', 'uphold'), vote(s, 'b', 'uphold')];
    expect(resolveStrike(s, votes, members, Date.parse('2026-11-17T09:00:00Z'))).toBe('upheld');
  });

  it('favours the member on a tie or silence when the vote closes', () => {
    const s = strike('c', MON, { statement: 'Train was cancelled', statementAt: '2026-11-17T08:00:00Z' });
    const closed = Date.parse('2026-11-18T08:00:00Z');
    expect(resolveStrike(s, [], members, closed)).toBe('excused');
    expect(resolveStrike(s, [vote(s, 'a', 'excuse'), vote(s, 'b', 'uphold')], members, closed)).toBe('excused');
  });

  it('upholds at close when more voted to uphold', () => {
    const four = ['a', 'b', 'c', 'd', 'e'];
    const s = strike('c', MON, { statement: 'Slept in', statementAt: '2026-11-17T08:00:00Z' });
    const votes = [vote(s, 'a', 'uphold'), vote(s, 'b', 'uphold'), vote(s, 'd', 'excuse')];
    expect(resolveStrike(s, votes, four, Date.parse('2026-11-17T09:00:00Z'))).toBeNull(); // 2 of 4 is not a majority
    expect(resolveStrike(s, votes, four, Date.parse('2026-11-18T08:00:00Z'))).toBe('upheld');
  });

  it('ignores a vote from the struck member and from non-members', () => {
    const s = strike('c', MON, { statement: 'Sick', statementAt: '2026-11-17T08:00:00Z' });
    const votes = [vote(s, 'c', 'excuse'), vote(s, 'zzz', 'excuse')];
    expect(resolveStrike(s, votes, members, Date.parse('2026-11-17T09:00:00Z'))).toBeNull();
  });

  it('leaves a settled strike alone', () => {
    expect(resolveStrike(strike('c', MON, { outcome: 'upheld' }), [], members, Date.now())).toBeNull();
  });

  it('counts pending and upheld strikes in the cycle, not excused or last week\'s', () => {
    const all = [
      strike('c', MON),
      strike('c', addDays(MON, 1), { outcome: 'upheld' }),
      strike('c', addDays(MON, 2), { outcome: 'excused' }),
      strike('c', addDays(MON, -1), { outcome: 'upheld' }),
      strike('a', MON),
    ];
    expect(strikesInCycle(all, 'c', addDays(MON, 3))).toHaveLength(2);
  });

  it('breaks the streak on the third upheld strike of a cycle, not the first or second', () => {
    const s1 = strike('c', MON, { outcome: 'upheld' });
    const s2 = strike('c', addDays(MON, 1), { outcome: 'upheld' });
    const s3 = strike('c', addDays(MON, 2));
    expect(breaksStreak([s1], s1)).toBe(false);
    expect(breaksStreak([s1, s2], s2)).toBe(false);
    expect(breaksStreak([s1, s2, s3], s3)).toBe(true);
  });

  it('does not break on a third strike when one was excused or fell in another week', () => {
    const excused = strike('c', MON, { outcome: 'excused' });
    const upheld = strike('c', addDays(MON, 1), { outcome: 'upheld' });
    const lastWeek = strike('c', addDays(MON, -2), { outcome: 'upheld' });
    const third = strike('c', addDays(MON, 2));
    expect(breaksStreak([excused, upheld, lastWeek, third], third)).toBe(false);
  });
});

describe('recap', () => {
  it('summarises the week and names who owes the forfeit', () => {
    const ta = task('a');
    const tb = task('b');
    const tc = task('c');
    const snap: GroupSnapshot = {
      group: { id: 'g', name: 'G', forfeit: 'Coffee', inviteCode: 'X', currentStreak: 1, bestStreak: 1, lastClosedDate: null, createdAt: '' },
      members: members.map((id) => ({ id, displayName: id, timezone: 'UTC', avatarColor: '#000', role: 'member', joinedAt: '' })),
      tasks: [ta, tb, tc],
      checkins: [checkin(ta, MON), checkin(tb, MON), checkin(ta, addDays(MON, 1)), checkin(tc, addDays(MON, -1))],
      verifications: [],
      comments: [],
      strikes: [strike('c', MON, { outcome: 'upheld' }), strike('b', addDays(MON, 1), { outcome: 'excused' })],
      votes: [],
    };
    const r = recap(snap, addDays(MON, 3), addDays(MON, 1));
    expect(r.start).toBe(MON);
    expect(r.rows.find((x) => x.userId === 'a')).toMatchObject({ checkins: 2, daysComplete: 2, strikes: 0 });
    expect(r.rows.find((x) => x.userId === 'b')).toMatchObject({ checkins: 1, daysComplete: 1, strikes: 0 });
    expect(r.rows.find((x) => x.userId === 'c')).toMatchObject({ checkins: 0, strikes: 1 });
    expect(r.photos).toHaveLength(3);
    expect(r.owesForfeit).toEqual(['c']);
  });
});

describe('settle (the full end-of-day job)', () => {
  const zones = [
    { id: 'a', timezone: 'America/Toronto' },
    { id: 'b', timezone: 'America/Toronto' },
    { id: 'c', timezone: 'Asia/Seoul' },
  ];
  const group = (over: Partial<GroupSnapshot['group']> = {}): GroupSnapshot['group'] => ({
    id: 'g', name: 'G', forfeit: '', inviteCode: 'X', currentStreak: 2, bestStreak: 2,
    lastClosedDate: addDays(MON, -1), createdAt: '2026-11-01T00:00:00Z', ...over,
  });
  let n = 0;
  const newId = () => `new${++n}`;
  // 05:00 UTC on Tuesday: Monday has just ended in Toronto, the last zone.
  const tuesdayAfterMidnight = Date.UTC(2026, 10, 17, 5, 0);

  it('does nothing while the day is still running for someone', () => {
    const tasks = zones.map((m) => task(m.id));
    const r = settle({ group: group(), members: zones, tasks, checkins: [], strikes: [], votes: [], now: Date.UTC(2026, 10, 17, 4, 59), newId });
    expect(r.closedDates).toEqual([]);
    expect(r.newStrikes).toEqual([]);
  });

  it('closes the day, strikes the member who missed and holds the streak', () => {
    const tasks = zones.map((m) => task(m.id));
    const checkins = [checkin(tasks[0]!, MON), checkin(tasks[1]!, MON)];
    const r = settle({ group: group(), members: zones, tasks, checkins, strikes: [], votes: [], now: tuesdayAfterMidnight, newId });
    expect(r.closedDates).toEqual([MON]);
    expect(r.newStrikes.map((s) => s.userId)).toEqual(['c']);
    expect(r.group).toMatchObject({ currentStreak: 2, lastClosedDate: MON });
  });

  it('is idempotent: a second run adds nothing', () => {
    const tasks = zones.map((m) => task(m.id));
    const first = settle({ group: group(), members: zones, tasks, checkins: [], strikes: [], votes: [], now: tuesdayAfterMidnight, newId });
    const again = settle({ group: first.group, members: zones, tasks, checkins: [], strikes: first.newStrikes, votes: [], now: tuesdayAfterMidnight, newId });
    expect(again.closedDates).toEqual([]);
    expect(again.newStrikes).toEqual([]);
    expect(again.outcomes).toEqual([]);
  });

  it('catches up several days and grows the streak for each full day', () => {
    const tasks = zones.map((m) => task(m.id));
    const days = [MON, addDays(MON, 1), addDays(MON, 2)];
    const checkins = days.flatMap((d) => tasks.map((t) => checkin(t, d)));
    const r = settle({ group: group(), members: zones, tasks, checkins, strikes: [], votes: [], now: Date.UTC(2026, 10, 19, 5, 0), newId });
    expect(r.closedDates).toEqual(days);
    expect(r.group).toMatchObject({ currentStreak: 5, bestStreak: 5 });
  });

  it('starts a new group from its creation date', () => {
    const r = settle({ group: group({ lastClosedDate: null, createdAt: '2026-11-16T15:00:00Z', currentStreak: 0, bestStreak: 0 }), members: zones, tasks: [], checkins: [], strikes: [], votes: [], now: tuesdayAfterMidnight, newId });
    expect(r.closedDates).toEqual([MON]);
  });

  it('never reaches back more than the catch-up limit', () => {
    const r = settle({ group: group({ lastClosedDate: '2026-01-01' }), members: zones, tasks: [], checkins: [], strikes: [], votes: [], now: tuesdayAfterMidnight, newId });
    expect(r.closedDates.length).toBeLessThanOrEqual(MAX_CATCH_UP_DAYS + 1);
    expect(r.group.lastClosedDate).toBe(MON);
  });

  it('breaks the streak when a third strike in the cycle is upheld by timeout', () => {
    const tasks = zones.map((m) => task(m.id));
    const s1 = strike('c', MON, { outcome: 'upheld' });
    const s2 = strike('c', addDays(MON, 1), { outcome: 'upheld' });
    const s3 = strike('c', addDays(MON, 2), { createdAt: '2026-11-19T05:00:00Z' });
    const g = group({ lastClosedDate: addDays(MON, 3), currentStreak: 9, bestStreak: 9 });
    const before = settle({ group: g, members: zones, tasks, checkins: [], strikes: [s1, s2, s3], votes: [], now: Date.parse('2026-11-20T04:00:00Z'), newId });
    expect(before.streakBroken).toBe(false);
    const after = settle({ group: g, members: zones, tasks, checkins: [], strikes: [s1, s2, s3], votes: [], now: Date.parse('2026-11-20T05:00:00Z'), newId });
    expect(after.outcomes).toEqual([{ strikeId: s3.id, outcome: 'upheld' }]);
    expect(after.streakBroken).toBe(true);
    expect(after.group).toMatchObject({ currentStreak: 0, bestStreak: 9 });
  });

  it('keeps the streak when the group excuses the third strike', () => {
    const s1 = strike('c', MON, { outcome: 'upheld' });
    const s2 = strike('c', addDays(MON, 1), { outcome: 'upheld' });
    const s3 = strike('c', addDays(MON, 2), { statement: 'Hospital', statementAt: '2026-11-19T06:00:00Z' });
    const g = group({ lastClosedDate: addDays(MON, 3), currentStreak: 9, bestStreak: 9 });
    const r = settle({ group: g, members: zones, tasks: [], checkins: [], strikes: [s1, s2, s3], votes: [vote(s3, 'a', 'excuse'), vote(s3, 'b', 'excuse')], now: Date.parse('2026-11-19T07:00:00Z'), newId });
    expect(r.outcomes).toEqual([{ strikeId: s3.id, outcome: 'excused' }]);
    expect(r.group.currentStreak).toBe(9);
  });
});
