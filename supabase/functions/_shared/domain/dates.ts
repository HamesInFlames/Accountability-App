import type { DateStr, TimeStr } from './types.ts';

const fmtCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = fmtCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    fmtCache.set(timeZone, f);
  }
  return f;
}

/** The local calendar date and wall-clock time of an instant in a timezone. */
export function localNow(at: Date | number, timeZone: string): { date: DateStr; time: TimeStr } {
  const parts: Record<string, string> = {};
  for (const p of formatter(timeZone).formatToParts(new Date(at))) parts[p.type] = p.value;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

export function localDate(at: Date | number, timeZone: string): DateStr {
  return localNow(at, timeZone).date;
}

function toUtc(date: DateStr): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

function fromUtc(d: Date): DateStr {
  return d.toISOString().slice(0, 10);
}

export function addDays(date: DateStr, n: number): DateStr {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + n);
  return fromUtc(d);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(date: DateStr): number {
  return toUtc(date).getUTCDay();
}

/** Finish-line cycles run Monday to Sunday; the finish line is the Sunday. */
export function cycleStart(date: DateStr): DateStr {
  return addDays(date, -((weekday(date) + 6) % 7));
}

export function cycleEnd(date: DateStr): DateStr {
  return addDays(cycleStart(date), 6);
}

export function daysBetween(from: DateStr, to: DateStr): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86_400_000);
}

export function datesFrom(start: DateStr, count: number): DateStr[] {
  return Array.from({ length: count }, (_, i) => addDays(start, i));
}

/** A date is over for the group only when it has ended for every member's timezone. */
export function dateEndedForAll(date: DateStr, timezones: string[], at: Date | number): boolean {
  return timezones.every((tz) => localDate(at, tz) > date);
}

export function inWindow(time: TimeStr, start: TimeStr, end: TimeStr): boolean {
  return time >= start && time <= end;
}
