import type {
  Checkin,
  Decision,
  Group,
  GroupSnapshot,
  Schedule,
  Task,
  TaskStatus,
  TimeStr,
  User,
  VoteChoice,
} from '@domain';

export interface Me extends User {
  email: string | null;
  notifyNudges: boolean;
}

export interface NewTask {
  groupId: string;
  ownerId: string;
  title: string;
  schedule: Schedule;
  windowStart: TimeStr;
  windowEnd: TimeStr;
}

export interface NewReport {
  targetUserId: string;
  checkinId: string | null;
  reason: string;
}

/**
 * Everything the screens need from a server. Two implementations:
 *   - SupabaseBackend: the real thing.
 *   - LocalBackend: an on-device demo with simulated friends, used when no Supabase keys are set
 *     and for hands-on prototype testing. Both run the same domain rules.
 */
export interface Backend {
  readonly mode: 'demo' | 'live';
  /** Current instant. The demo can move its clock forward to show a day ending. */
  now(): number;

  getMe(): Promise<Me | null>;
  signUp(input: { email: string; password: string; displayName: string }): Promise<Me>;
  signIn(email: string, password: string): Promise<Me>;
  signOut(): Promise<void>;
  deleteAccount(): Promise<void>;
  updateProfile(patch: Partial<Pick<Me, 'displayName' | 'timezone' | 'notifyNudges'>> & { pushToken?: string | null }): Promise<Me>;

  listGroups(): Promise<Group[]>;
  createGroup(name: string, forfeit: string): Promise<Group>;
  joinGroup(code: string): Promise<Group>;
  leaveGroup(groupId: string): Promise<void>;
  updateGroup(groupId: string, name: string, forfeit: string): Promise<void>;
  getSnapshot(groupId: string): Promise<GroupSnapshot>;
  /** Live updates for a group. Returns an unsubscribe function. */
  subscribe(groupId: string, onChange: () => void): () => void;
  /** Ask the server to close finished days and settle strike votes for this group now. */
  settle(groupId: string): Promise<void>;

  createTask(input: NewTask): Promise<Task>;
  setTaskStatus(taskId: string, status: TaskStatus): Promise<void>;
  submitCheckin(taskId: string, photoUri: string, explanation: string): Promise<Checkin>;
  reviewCheckin(checkinId: string, decision: Decision): Promise<void>;
  addComment(checkinId: string, body: string): Promise<void>;
  postStatement(strikeId: string, statement: string): Promise<void>;
  castVote(strikeId: string, choice: VoteChoice): Promise<void>;
  nudge(groupId: string, toId: string): Promise<void>;

  report(input: NewReport): Promise<void>;
  listBlocked(): Promise<string[]>;
  block(userId: string): Promise<void>;
  unblock(userId: string): Promise<void>;

  /** A displayable URL for a stored proof photo, or null for demo placeholders. */
  photoUrl(path: string | null): Promise<string | null>;

  /** Demo only: end the current day and start the next one. */
  demoAdvanceDay?(): Promise<void>;
  /** Demo only: wipe the demo and start over. */
  demoReset?(): Promise<void>;
}

export const DEMO_INVITE_CODE = 'DEMO42';
