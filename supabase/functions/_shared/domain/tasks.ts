import { weekday } from './dates.ts';
import { RULES } from './rules.ts';
import type { Checkin, DateStr, DayStatus, Task, TimeStr } from './types.ts';

export function scheduledOn(task: Pick<Task, 'schedule'>, date: DateStr): boolean {
  const s = task.schedule;
  if (s.kind === 'daily') return true;
  if (s.kind === 'weekdays') return s.days.includes(weekday(date));
  return s.date === date;
}

/** Due means: accepted, running, past its first due date, and scheduled for that day. */
export function dueOn(task: Task, date: DateStr): boolean {
  return (
    task.status === 'active' &&
    task.activeFrom !== null &&
    task.activeFrom <= date &&
    scheduledOn(task, date)
  );
}

/**
 * A task that becomes active after today's check-in window has closed starts tomorrow,
 * so nobody is struck for a window they never had.
 */
export function firstDueDate(today: DateStr, nowTime: TimeStr, windowEnd: TimeStr, tomorrow: DateStr): DateStr {
  return nowTime <= windowEnd ? today : tomorrow;
}

/** A check-in counts unless a friend has questioned it. Unreviewed check-ins count: a lazy reviewer must not break a streak. */
export function counts(checkin: Pick<Checkin, 'status'>): boolean {
  return checkin.status !== 'questioned';
}

export function checkinFor(checkins: Checkin[], taskId: string, date: DateStr): Checkin | undefined {
  return checkins.find((c) => c.taskId === taskId && c.date === date);
}

export interface MemberDay {
  due: Task[];
  done: Task[];
  status: DayStatus;
}

export function memberDay(userId: string, date: DateStr, tasks: Task[], checkins: Checkin[]): MemberDay {
  const due = tasks.filter((t) => t.ownerId === userId && dueOn(t, date));
  const done = due.filter((t) => {
    const c = checkinFor(checkins, t.id, date);
    return c !== undefined && counts(c);
  });
  const status: DayStatus = due.length === 0 ? 'rest' : done.length === due.length ? 'complete' : 'missed';
  return { due, done, status };
}

/** Tasks that count against the 3-task limit: running or paused ones the owner has accepted. */
export function activeTaskCount(tasks: Task[], ownerId: string): number {
  return tasks.filter((t) => t.ownerId === ownerId && (t.status === 'active' || t.status === 'paused')).length;
}

export function canTakeTask(tasks: Task[], ownerId: string): boolean {
  return activeTaskCount(tasks, ownerId) < RULES.maxActiveTasks;
}

export function validExplanation(text: string): boolean {
  return text.trim().length >= RULES.minExplanationChars;
}
