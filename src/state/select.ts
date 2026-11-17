import {
  addDays,
  checkinFor,
  cycleStart,
  datesFrom,
  dueOn,
  memberDay,
  scheduledOn,
  strikesInCycle,
  type Checkin,
  type DateStr,
  type DayStatus,
  type GroupSnapshot,
  type Member,
  type Schedule,
  type Strike,
  type Task,
} from '@domain';

export const member = (snap: GroupSnapshot, id: string): Member =>
  snap.members.find((m) => m.id === id) ?? { id, displayName: 'Former member', timezone: 'UTC', avatarColor: '#94A3B8', role: 'member', joinedAt: '' };

export const taskOf = (snap: GroupSnapshot, c: Checkin): Task | undefined => snap.tasks.find((t) => t.id === c.taskId);

export function myToday(snap: GroupSnapshot, meId: string, today: DateStr) {
  return snap.tasks
    .filter((t) => t.ownerId === meId && dueOn(t, today))
    .map((task) => ({ task, checkin: checkinFor(snap.checkins, task.id, today) }));
}

/** Friends' check-ins from today or yesterday that nobody has reviewed yet. */
export function reviewQueue(snap: GroupSnapshot, meId: string, today: DateStr, blocked: string[]): Checkin[] {
  const since = addDays(today, -1);
  return snap.checkins
    .filter((c) => c.ownerId !== meId && c.status === 'submitted' && c.date >= since && !blocked.includes(c.ownerId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export const myOpenStrikes = (snap: GroupSnapshot, meId: string): Strike[] =>
  snap.strikes.filter((s) => s.userId === meId && s.outcome === 'pending' && !s.statementAt);

export const votesNeeded = (snap: GroupSnapshot, meId: string): Strike[] =>
  snap.strikes.filter(
    (s) => s.userId !== meId && s.outcome === 'pending' && !!s.statementAt &&
      !snap.votes.some((v) => v.strikeId === s.id && v.voterId === meId),
  );

export const pendingForMe = (snap: GroupSnapshot, meId: string): Task[] =>
  snap.tasks.filter((t) => t.ownerId === meId && t.status === 'pending');

export const strikeCount = (snap: GroupSnapshot, userId: string, today: DateStr): number =>
  strikesInCycle(snap.strikes, userId, today).length;

export type WeekDot = { date: DateStr; state: 'done' | 'missed' | 'rest' | 'today' | 'future' };

/** Monday-to-Sunday dots for the streak card: how the whole group did on each day. */
export function weekDots(snap: GroupSnapshot, today: DateStr): WeekDot[] {
  return datesFrom(cycleStart(today), 7).map((date) => {
    if (date > today) return { date, state: 'future' };
    const statuses: DayStatus[] = snap.members.map((m) => memberDay(m.id, date, snap.tasks, snap.checkins).status);
    const allDone = !statuses.includes('missed') && statuses.includes('complete');
    if (date === today) return { date, state: allDone ? 'done' : 'today' };
    if (statuses.includes('missed')) return { date, state: 'missed' };
    return { date, state: allDone ? 'done' : 'rest' };
  });
}

/** Consecutive scheduled days, ending today or yesterday, on which this task has a counted check-in. */
export function taskStreak(snap: GroupSnapshot, task: Task, today: DateStr): number {
  let n = 0;
  let d = today;
  for (let i = 0; i < 400; i++, d = addDays(d, -1)) {
    if (task.activeFrom === null || d < task.activeFrom) break;
    if (!scheduledOn(task, d)) continue;
    const c = checkinFor(snap.checkins, task.id, d);
    if (c && c.status !== 'questioned') n++;
    else if (d === today) continue; // today is still open
    else break;
  }
  return n;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function prettyDate(date: DateStr, today?: DateStr): string {
  if (today) {
    if (date === today) return 'Today';
    if (date === addDays(today, -1)) return 'Yesterday';
    if (date === addDays(today, 1)) return 'Tomorrow';
  }
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${DAY_NAMES[wd]} ${d} ${MONTHS[m - 1]}`;
}

export function scheduleLabel(s: Schedule, today?: DateStr): string {
  if (s.kind === 'daily') return 'Every day';
  if (s.kind === 'once') return `Due ${prettyDate(s.date, today)}`;
  if (s.days.length === 7) return 'Every day';
  return [...s.days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => DAY_NAMES[d]).join(', ');
}

export const windowLabel = (t: Pick<Task, 'windowStart' | 'windowEnd'>) => `${t.windowStart} to ${t.windowEnd}`;

export function hoursLeft(deadlineMs: number, now: number): string {
  const mins = Math.max(0, Math.round((deadlineMs - now) / 60_000));
  if (mins < 60) return `${mins} min left`;
  return `${Math.round(mins / 60)} h left`;
}
