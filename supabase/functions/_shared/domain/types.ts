// Shared domain types. This folder is pure TypeScript with no platform imports:
// the app, the demo backend and the Supabase Edge Functions all run the same rules from here.

/** Calendar date in a member's local timezone, 'YYYY-MM-DD'. */
export type DateStr = string;
/** Local wall-clock time, 'HH:MM' (24h). */
export type TimeStr = string;

export type Schedule =
  | { kind: 'daily' }
  /** 0 = Sunday … 6 = Saturday. Days not listed are rest days. */
  | { kind: 'weekdays'; days: number[] }
  | { kind: 'once'; date: DateStr };

export type TaskStatus = 'pending' | 'active' | 'paused' | 'ended' | 'declined';
export type CheckinStatus = 'submitted' | 'approved' | 'questioned';
export type StrikeOutcome = 'pending' | 'excused' | 'upheld';
export type VoteChoice = 'excuse' | 'uphold';
export type Decision = 'approve' | 'question';
export type DayStatus = 'complete' | 'missed' | 'rest';

export interface User {
  id: string;
  displayName: string;
  timezone: string;
  avatarColor: string;
}

export interface Group {
  id: string;
  name: string;
  forfeit: string;
  inviteCode: string;
  currentStreak: number;
  bestStreak: number;
  /** Last date the end-of-day job closed for this group. */
  lastClosedDate: DateStr | null;
  createdAt: string;
}

export interface Member extends User {
  role: 'admin' | 'member';
  joinedAt: string;
}

export interface Task {
  id: string;
  groupId: string;
  ownerId: string;
  creatorId: string;
  title: string;
  schedule: Schedule;
  windowStart: TimeStr;
  windowEnd: TimeStr;
  status: TaskStatus;
  /** First date the task can be due. Null until the owner accepts it. */
  activeFrom: DateStr | null;
  createdAt: string;
}

export interface Checkin {
  id: string;
  taskId: string;
  groupId: string;
  ownerId: string;
  date: DateStr;
  photoPath: string | null;
  explanation: string;
  status: CheckinStatus;
  createdAt: string;
}

export interface Verification {
  id: string;
  checkinId: string;
  reviewerId: string;
  decision: Decision;
  createdAt: string;
}

export interface Comment {
  id: string;
  checkinId: string;
  authorId: string;
  body: string;
  createdAt: string;
}

export interface Strike {
  id: string;
  groupId: string;
  userId: string;
  date: DateStr;
  statement: string | null;
  statementAt: string | null;
  outcome: StrikeOutcome;
  resolvedAt: string | null;
  createdAt: string;
}

export interface Vote {
  strikeId: string;
  voterId: string;
  choice: VoteChoice;
}

/** Everything the app needs to draw one group. Small by design: 3 to 8 members. */
export interface GroupSnapshot {
  group: Group;
  members: Member[];
  tasks: Task[];
  checkins: Checkin[];
  verifications: Verification[];
  comments: Comment[];
  strikes: Strike[];
  votes: Vote[];
}
