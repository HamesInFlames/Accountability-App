import { cycleStart } from './dates.ts';
import { RULES } from './rules.ts';
import type { DateStr, Strike, StrikeOutcome, Vote } from './types.ts';

const HOUR = 3_600_000;

export interface Tally {
  excuse: number;
  uphold: number;
  eligible: number;
}

export function tally(strike: Strike, votes: Vote[], memberIds: string[]): Tally {
  const eligible = memberIds.filter((id) => id !== strike.userId);
  const mine = votes.filter((v) => v.strikeId === strike.id && eligible.includes(v.voterId));
  return {
    excuse: mine.filter((v) => v.choice === 'excuse').length,
    uphold: mine.filter((v) => v.choice === 'uphold').length,
    eligible: eligible.length,
  };
}

export function statementDeadline(strike: Strike): number {
  return new Date(strike.createdAt).getTime() + RULES.statementWindowHours * HOUR;
}

export function voteDeadline(strike: Strike): number | null {
  return strike.statementAt ? new Date(strike.statementAt).getTime() + RULES.voteWindowHours * HOUR : null;
}

/**
 * Decide a pending strike, or return null if it is still open.
 *
 * - No statement within 24 hours: upheld.
 * - A statement was posted: the other members vote. A strict majority either way settles it at once.
 * - When the 24-hour vote closes without a majority, ties and silence favour the member,
 *   for the same reason an unreviewed check-in counts: inactive friends must not cost someone a strike.
 */
export function resolveStrike(strike: Strike, votes: Vote[], memberIds: string[], at: Date | number): StrikeOutcome | null {
  if (strike.outcome !== 'pending') return null;
  const now = new Date(at).getTime();
  if (!strike.statementAt) return now >= statementDeadline(strike) ? 'upheld' : null;
  const t = tally(strike, votes, memberIds);
  if (t.eligible === 0) return 'excused';
  if (t.excuse > t.eligible / 2) return 'excused';
  if (t.uphold > t.eligible / 2) return 'upheld';
  if (now >= voteDeadline(strike)!) return t.excuse >= t.uphold ? 'excused' : 'upheld';
  return null;
}

/** Strikes that currently count against a member in the cycle containing `date`: pending and upheld. */
export function strikesInCycle(strikes: Strike[], userId: string, date: DateStr): Strike[] {
  const start = cycleStart(date);
  return strikes.filter(
    (s) => s.userId === userId && s.outcome !== 'excused' && cycleStart(s.date) === start,
  );
}

/** The group streak breaks when a member's third strike of a cycle is upheld. */
export function breaksStreak(strikes: Strike[], justUpheld: Strike): boolean {
  const start = cycleStart(justUpheld.date);
  const upheld = strikes.filter(
    (s) =>
      s.userId === justUpheld.userId &&
      cycleStart(s.date) === start &&
      (s.outcome === 'upheld' || s.id === justUpheld.id),
  );
  return upheld.length >= RULES.strikesPerCycle;
}
