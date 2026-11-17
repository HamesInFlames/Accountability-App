import { addDays, dateEndedForAll, localDate } from './dates.ts';
import { closeDay } from './endOfDay.ts';
import { breaksStreak, resolveStrike } from './strikes.ts';
import type { Checkin, DateStr, Group, Strike, StrikeOutcome, Task, Vote } from './types.ts';

export const MAX_CATCH_UP_DAYS = 14;

export interface SettleInput {
  group: Group;
  members: { id: string; timezone: string }[];
  tasks: Task[];
  checkins: Checkin[];
  strikes: Strike[];
  votes: Vote[];
  now: number;
  newId: () => string;
}

export interface SettleResult {
  /** The group with its streak, best streak and last closed date brought up to date. */
  group: Group;
  closedDates: DateStr[];
  newStrikes: Strike[];
  outcomes: { strikeId: string; outcome: StrikeOutcome }[];
  streakBroken: boolean;
}

/**
 * The whole end-of-day job for one group, as a pure function:
 *   1. close every date that has ended for all members since the last closed date
 *      (a strike for each member who missed; the streak grows when nobody did), then
 *   2. settle pending strikes, breaking the streak on a third upheld strike in a cycle.
 * The caller loads the inputs and writes the result. Running it twice changes nothing.
 */
export function settle(input: SettleInput): SettleResult {
  const { members, tasks, checkins, votes, now } = input;
  const group = { ...input.group };
  const memberIds = members.map((m) => m.id);
  const zones = members.map((m) => m.timezone);
  const closedDates: DateStr[] = [];
  const newStrikes: Strike[] = [];
  const outcomes: SettleResult['outcomes'] = [];
  let streakBroken = false;
  if (members.length === 0) return { group, closedDates, newStrikes, outcomes, streakBroken };

  let date = group.lastClosedDate ? addDays(group.lastClosedDate, 1) : localDate(new Date(group.createdAt), zones[0]!);
  const earliest = addDays(localDate(now, 'UTC'), -MAX_CATCH_UP_DAYS);
  if (date < earliest) date = earliest;

  while (dateEndedForAll(date, zones, now)) {
    const result = closeDay({
      date,
      memberIds,
      tasks,
      checkins: checkins.filter((c) => c.date === date),
      streak: group.currentStreak,
      bestStreak: group.bestStreak,
    });
    for (const userId of result.struck) {
      const exists = [...input.strikes, ...newStrikes].some((s) => s.userId === userId && s.date === date);
      if (!exists) {
        newStrikes.push({
          id: input.newId(),
          groupId: group.id,
          userId,
          date,
          statement: null,
          statementAt: null,
          outcome: 'pending',
          resolvedAt: null,
          createdAt: new Date(now).toISOString(),
        });
      }
    }
    group.currentStreak = result.streak;
    group.bestStreak = result.bestStreak;
    group.lastClosedDate = date;
    closedDates.push(date);
    date = addDays(date, 1);
  }

  const all = [...input.strikes, ...newStrikes].map((s) => ({ ...s }));
  for (const s of all) {
    const outcome = resolveStrike(s, votes, memberIds, now);
    if (!outcome) continue;
    outcomes.push({ strikeId: s.id, outcome });
    if (outcome === 'upheld' && breaksStreak(all, s)) {
      group.currentStreak = 0;
      streakBroken = true;
    }
    s.outcome = outcome;
  }
  return { group, closedDates, newStrikes, outcomes, streakBroken };
}
