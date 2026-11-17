import { memberDay } from './tasks.ts';
import type { Checkin, DateStr, DayStatus, Task } from './types.ts';

export interface CloseDayInput {
  date: DateStr;
  memberIds: string[];
  tasks: Task[];
  checkins: Checkin[];
  streak: number;
  bestStreak: number;
}

export interface CloseDayResult {
  statuses: Record<string, DayStatus>;
  /** Members who get a strike for this date. */
  struck: string[];
  streak: number;
  bestStreak: number;
}

/**
 * The end-of-day decision for one group and one date. Pure: the caller loads state, calls this,
 * then writes the strikes and the streak.
 *
 * - Everyone with something due finished it: the streak grows by one.
 * - Someone missed: they get a strike and the streak holds. It breaks only when a member's
 *   third strike of the cycle is upheld (see strikes.ts).
 * - Nobody had anything due (a shared rest day): the streak holds.
 */
export function closeDay(input: CloseDayInput): CloseDayResult {
  const statuses: Record<string, DayStatus> = {};
  for (const id of input.memberIds) {
    statuses[id] = memberDay(id, input.date, input.tasks, input.checkins).status;
  }
  const values = Object.values(statuses);
  const struck = input.memberIds.filter((id) => statuses[id] === 'missed');
  const grew = struck.length === 0 && values.includes('complete');
  const streak = grew ? input.streak + 1 : input.streak;
  return { statuses, struck, streak, bestStreak: Math.max(input.bestStreak, streak) };
}
