import { addDays, cycleStart, datesFrom } from './dates.ts';
import { memberDay, counts } from './tasks.ts';
import type { Checkin, DateStr, GroupSnapshot } from './types.ts';

export interface RecapRow {
  userId: string;
  checkins: number;
  daysComplete: number;
  strikes: number;
}

export interface Recap {
  start: DateStr;
  end: DateStr;
  rows: RecapRow[];
  photos: Checkin[];
  /** Members with the most strikes, who owe the forfeit. Empty when nobody was struck. */
  owesForfeit: string[];
}

/** The weekly finish line: what the group did between Monday and Sunday of the cycle containing `date`. */
export function recap(snap: GroupSnapshot, date: DateStr, through: DateStr = addDays(cycleStart(date), 6)): Recap {
  const start = cycleStart(date);
  const end = addDays(start, 6);
  const days = datesFrom(start, 7).filter((d) => d <= through);
  const inCycle = snap.checkins.filter((c) => c.date >= start && c.date <= end && counts(c));
  const rows = snap.members.map((m) => ({
    userId: m.id,
    checkins: inCycle.filter((c) => c.ownerId === m.id).length,
    daysComplete: days.filter((d) => memberDay(m.id, d, snap.tasks, snap.checkins).status === 'complete').length,
    strikes: snap.strikes.filter(
      (s) => s.userId === m.id && s.outcome !== 'excused' && s.date >= start && s.date <= end,
    ).length,
  }));
  const most = Math.max(0, ...rows.map((r) => r.strikes));
  return {
    start,
    end,
    rows,
    photos: inCycle.filter((c) => c.photoPath !== null).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    owesForfeit: most === 0 ? [] : rows.filter((r) => r.strikes === most).map((r) => r.userId),
  };
}
