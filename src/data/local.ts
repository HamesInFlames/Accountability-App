import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  addDays,
  canTakeTask,
  firstDueDate,
  inWindow,
  localNow,
  RULES,
  settle,
  validExplanation,
  type Checkin,
  type Comment,
  type Decision,
  type Group,
  type GroupSnapshot,
  type Member,
  type Strike,
  type Task,
  type TaskStatus,
  type User,
  type Verification,
  type Vote,
  type VoteChoice,
} from '@domain';

import { avatarColors } from '@/ui/theme';

import { DEMO_INVITE_CODE, type Backend, type Me, type NewReport, type NewTask } from './backend';

const KEY = 'accountability.demo.v1';
const DAY = 86_400_000;

interface Membership {
  groupId: string;
  userId: string;
  role: 'admin' | 'member';
  joinedAt: string;
}

interface State {
  me: Me | null;
  clockOffset: number;
  users: Record<string, User>;
  groups: Group[];
  memberships: Membership[];
  tasks: Task[];
  checkins: Checkin[];
  verifications: Verification[];
  comments: Comment[];
  strikes: Strike[];
  votes: Vote[];
  blocked: string[];
  photos: Record<string, string>;
  nudges: string[];
}

const empty = (): State => ({
  me: null, clockOffset: 0, users: {}, groups: [], memberships: [], tasks: [], checkins: [],
  verifications: [], comments: [], strikes: [], votes: [], blocked: [], photos: {}, nudges: [],
});

const id = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
  const r = (Math.random() * 16) | 0;
  return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
});

const BOTS = [
  { id: 'bot-maya', displayName: 'Maya', avatarColor: avatarColors[1]! },
  { id: 'bot-leo', displayName: 'Leo', avatarColor: avatarColors[2]! },
  { id: 'bot-sam', displayName: 'Sam', avatarColor: avatarColors[3]! },
];
const BOT_TASKS: Record<string, { title: string; note: string }> = {
  'bot-maya': { title: 'Gym before class', note: 'Legs and core today, forty minutes including the warm-up.' },
  'bot-leo': { title: 'Two hours on the thesis', note: 'Wrote the methods section and cleaned up the references.' },
  'bot-sam': { title: 'No phone until 10am', note: 'Phone stayed in the drawer. Made breakfast and read instead.' },
};

/**
 * On-device demo backend. It keeps one person's data in local storage and plays the part of three
 * friends, so every screen and rule can be tried without a server or a second phone.
 * Rules are enforced with the same domain functions the real server uses.
 */
export class LocalBackend implements Backend {
  readonly mode = 'demo' as const;
  private s: State = empty();
  private loaded: Promise<void> | null = null;
  private listeners = new Set<() => void>();

  now(): number {
    return Date.now() + this.s.clockOffset;
  }

  private load(): Promise<void> {
    this.loaded ??= AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (raw) this.s = { ...empty(), ...(JSON.parse(raw) as State) };
      })
      .catch(() => undefined);
    return this.loaded;
  }

  private async save(): Promise<void> {
    try {
      await AsyncStorage.setItem(KEY, JSON.stringify(this.s));
    } catch {
      // Storage full (photos are the usual cause). The demo keeps working in memory.
    }
    this.listeners.forEach((l) => l());
  }

  private me(): Me {
    if (!this.s.me) throw new Error('Not signed in');
    return this.s.me;
  }

  private local() {
    return localNow(this.now(), this.me().timezone);
  }

  private members(groupId: string): string[] {
    return this.s.memberships.filter((m) => m.groupId === groupId).map((m) => m.userId);
  }

  private requireMember(groupId: string) {
    if (!this.members(groupId).includes(this.me().id)) throw new Error('You are not in this group');
  }

  // ── Account ────────────────────────────────────────────────────────────────────────────────

  async getMe() {
    await this.load();
    return this.s.me;
  }

  async signUp({ email, displayName }: { email: string; password: string; displayName: string }) {
    await this.load();
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const me: Me = { id: id(), displayName: displayName.trim() || 'You', timezone, avatarColor: avatarColors[0]!, email: email || null, notifyNudges: true };
    this.s = { ...empty(), me, users: { [me.id]: me } };
    for (const b of BOTS) this.s.users[b.id] = { ...b, timezone };
    await this.save();
    return me;
  }

  async signIn() {
    await this.load();
    if (!this.s.me) throw new Error('The demo has no accounts to sign in to. Start the demo instead.');
    return this.s.me;
  }

  async signOut() {
    this.s = empty();
    await AsyncStorage.removeItem(KEY).catch(() => undefined);
  }

  async deleteAccount() {
    await this.signOut();
  }

  async updateProfile(patch: Partial<Pick<Me, 'displayName' | 'timezone' | 'notifyNudges'>>) {
    const me = { ...this.me(), ...patch };
    if ('pushToken' in me) delete (me as Record<string, unknown>).pushToken;
    this.s.me = me;
    this.s.users[me.id] = me;
    await this.save();
    return me;
  }

  // ── Groups ─────────────────────────────────────────────────────────────────────────────────

  async listGroups() {
    await this.load();
    if (!this.s.me) return [];
    const mine = this.s.memberships.filter((m) => m.userId === this.s.me!.id).map((m) => m.groupId);
    return this.s.groups.filter((g) => mine.includes(g.id));
  }

  async createGroup(name: string, forfeit: string) {
    const me = this.me();
    const { date } = this.local();
    const group = this.addGroup(name.trim(), forfeit.trim(), code(), 'admin');
    // The demo's friends "accept the invite" straight away so the group is alive.
    for (const b of BOTS) {
      this.s.memberships.push({ groupId: group.id, userId: b.id, role: 'member', joinedAt: iso(this.now()) });
      this.s.tasks.push(botTask(group.id, b.id, date, this.now()));
    }
    this.botCheckin(group.id, 'bot-maya', date);
    this.s.tasks.push({
      id: id(), groupId: group.id, ownerId: me.id, creatorId: 'bot-sam', title: 'Read 20 pages',
      schedule: { kind: 'daily' }, windowStart: RULES.defaultWindowStart, windowEnd: '23:59',
      status: 'pending', activeFrom: null, createdAt: iso(this.now()),
    });
    await this.save();
    return group;
  }

  async joinGroup(input: string) {
    const me = this.me();
    const c = input.trim().toUpperCase();
    const existing = this.s.groups.find((g) => g.inviteCode === c);
    if (existing) {
      if (!this.members(existing.id).includes(me.id)) {
        this.s.memberships.push({ groupId: existing.id, userId: me.id, role: 'member', joinedAt: iso(this.now()) });
      }
      await this.save();
      return existing;
    }
    if (c !== DEMO_INVITE_CODE) throw new Error(`No group has that invite code. In the demo, try ${DEMO_INVITE_CODE}.`);
    const group = this.seedEstablishedGroup();
    await this.save();
    return group;
  }

  private addGroup(name: string, forfeit: string, inviteCode: string, role: 'admin' | 'member'): Group {
    const group: Group = {
      id: id(), name, forfeit, inviteCode, currentStreak: 0, bestStreak: 0,
      lastClosedDate: addDays(this.local().date, -1), createdAt: iso(this.now()),
    };
    this.s.groups.push(group);
    this.s.memberships.push({ groupId: group.id, userId: this.me().id, role, joinedAt: iso(this.now()) });
    return group;
  }

  /** A group that has been running for a week: history, a streak, and a strike waiting for a vote. */
  private seedEstablishedGroup(): Group {
    const me = this.me();
    const { date: today } = this.local();
    const group = this.addGroup('The Library Crew', 'Most strikes buys the coffee on Sunday', DEMO_INVITE_CODE, 'member');
    group.currentStreak = 5;
    group.bestStreak = 5;
    const start = addDays(today, -6);
    for (const b of BOTS) {
      this.s.memberships.push({ groupId: group.id, userId: b.id, role: b.id === 'bot-maya' ? 'admin' : 'member', joinedAt: iso(this.now() - 7 * DAY) });
      this.s.tasks.push(botTask(group.id, b.id, start, this.now() - 7 * DAY));
    }
    for (let i = 6; i >= 1; i--) {
      const d = addDays(today, -i);
      for (const b of BOTS) {
        if (b.id === 'bot-leo' && i === 1) continue; // Leo missed yesterday
        const c = this.botCheckin(group.id, b.id, d);
        c.status = 'approved';
      }
    }
    const strike: Strike = {
      id: id(), groupId: group.id, userId: 'bot-leo', date: addDays(today, -1),
      statement: 'My shift at the café ran three hours over and I got home after midnight. I will do a double session today.',
      statementAt: iso(this.now() - 2 * 3_600_000), outcome: 'pending', resolvedAt: null, createdAt: iso(this.now() - 5 * 3_600_000),
    };
    this.s.strikes.push(strike);
    this.s.votes.push({ strikeId: strike.id, voterId: 'bot-maya', choice: 'excuse' });
    this.botCheckin(group.id, 'bot-maya', today);
    this.botCheckin(group.id, 'bot-leo', today).status = 'approved';
    this.s.tasks.push({
      id: id(), groupId: group.id, ownerId: me.id, creatorId: 'bot-sam', title: 'Read 20 pages',
      schedule: { kind: 'daily' }, windowStart: RULES.defaultWindowStart, windowEnd: '23:59',
      status: 'pending', activeFrom: null, createdAt: iso(this.now()),
    });
    return group;
  }

  private botCheckin(groupId: string, botId: string, date: string): Checkin {
    const task = this.s.tasks.find((t) => t.groupId === groupId && t.ownerId === botId)!;
    const c: Checkin = {
      id: id(), taskId: task.id, groupId, ownerId: botId, date, photoPath: null,
      explanation: BOT_TASKS[botId]!.note, status: 'submitted', createdAt: iso(Math.min(this.now(), Date.parse(`${date}T14:30:00.000Z`))),
    };
    this.s.checkins.push(c);
    return c;
  }

  async leaveGroup(groupId: string) {
    const me = this.me();
    this.s.memberships = this.s.memberships.filter((m) => !(m.groupId === groupId && m.userId === me.id));
    this.s.tasks.forEach((t) => {
      if (t.groupId === groupId && t.ownerId === me.id && t.status !== 'declined') t.status = 'ended';
    });
    await this.save();
  }

  async updateGroup(groupId: string, name: string, forfeit: string) {
    this.requireMember(groupId);
    const g = this.s.groups.find((x) => x.id === groupId)!;
    g.name = name.trim();
    g.forfeit = forfeit.trim();
    await this.save();
  }

  async getSnapshot(groupId: string): Promise<GroupSnapshot> {
    await this.load();
    this.requireMember(groupId);
    const group = this.s.groups.find((g) => g.id === groupId)!;
    const members: Member[] = this.s.memberships
      .filter((m) => m.groupId === groupId)
      .map((m) => ({ ...this.s.users[m.userId]!, role: m.role, joinedAt: m.joinedAt }));
    const checkins = this.s.checkins.filter((c) => c.groupId === groupId);
    const cids = new Set(checkins.map((c) => c.id));
    const strikes = this.s.strikes.filter((x) => x.groupId === groupId);
    const sids = new Set(strikes.map((x) => x.id));
    return clone({
      group,
      members,
      tasks: this.s.tasks.filter((t) => t.groupId === groupId),
      checkins,
      verifications: this.s.verifications.filter((v) => cids.has(v.checkinId)),
      comments: this.s.comments.filter((c) => cids.has(c.checkinId)),
      strikes,
      votes: this.s.votes.filter((v) => sids.has(v.strikeId)),
    });
  }

  subscribe(_groupId: string, onChange: () => void) {
    this.listeners.add(onChange);
    return () => void this.listeners.delete(onChange);
  }

  async settle(groupId: string) {
    const group = this.s.groups.find((g) => g.id === groupId);
    if (!group) return;
    const sids = new Set(this.s.strikes.filter((x) => x.groupId === groupId).map((x) => x.id));
    const result = settle({
      group,
      members: this.members(groupId).map((uid) => ({ id: uid, timezone: this.s.users[uid]!.timezone })),
      tasks: this.s.tasks.filter((t) => t.groupId === groupId),
      checkins: this.s.checkins.filter((c) => c.groupId === groupId),
      strikes: this.s.strikes.filter((x) => x.groupId === groupId),
      votes: this.s.votes.filter((v) => sids.has(v.strikeId)),
      now: this.now(),
      newId: id,
    });
    Object.assign(group, result.group);
    this.s.strikes.push(...result.newStrikes);
    for (const o of result.outcomes) {
      const st = this.s.strikes.find((x) => x.id === o.strikeId)!;
      st.outcome = o.outcome;
      st.resolvedAt = iso(this.now());
    }
    await this.save();
  }

  // ── Tasks and check-ins ────────────────────────────────────────────────────────────────────

  async createTask(input: NewTask) {
    const me = this.me();
    this.requireMember(input.groupId);
    const mine = input.ownerId === me.id;
    const groupTasks = this.s.tasks.filter((t) => t.groupId === input.groupId);
    if (mine && !canTakeTask(groupTasks, me.id)) throw new Error('You already have 3 active tasks. End or finish one first.');
    if (!input.title.trim()) throw new Error('Give the task a title');
    if (input.windowStart >= input.windowEnd) throw new Error('The check-in window must end after it starts');
    const { date, time } = this.local();
    const task: Task = {
      id: id(), ...input, title: input.title.trim(), creatorId: me.id,
      status: mine ? 'active' : 'pending',
      activeFrom: mine ? firstDueDate(date, time, input.windowEnd, addDays(date, 1)) : null,
      createdAt: iso(this.now()),
    };
    this.s.tasks.push(task);
    // A demo friend accepts a task you set for them.
    if (!mine && task.ownerId.startsWith('bot-') && canTakeTask(groupTasks, task.ownerId)) {
      task.status = 'active';
      task.activeFrom = addDays(date, 1);
    }
    await this.save();
    return clone(task);
  }

  async setTaskStatus(taskId: string, status: TaskStatus) {
    const me = this.me();
    const t = this.s.tasks.find((x) => x.id === taskId);
    if (!t) throw new Error('Task not found');
    const { date, time } = this.local();
    const start = firstDueDate(date, time, t.windowEnd, addDays(date, 1));
    if (t.ownerId !== me.id) {
      if (t.creatorId === me.id && t.status === 'pending' && status === 'declined') t.status = 'declined';
      else throw new Error('Only the owner can change this task');
    } else if ((t.status === 'pending' || t.status === 'paused') && status === 'active') {
      if (t.status === 'pending' && !canTakeTask(this.s.tasks.filter((x) => x.groupId === t.groupId), me.id)) {
        throw new Error('You already have 3 active tasks. End or finish one first.');
      }
      t.status = 'active';
      t.activeFrom = start;
    } else if (t.status === 'pending' && status === 'declined') t.status = 'declined';
    else if (t.status === 'active' && status === 'paused') t.status = 'paused';
    else if ((t.status === 'active' || t.status === 'paused') && status === 'ended') t.status = 'ended';
    else throw new Error(`Cannot change a ${t.status} task to ${status}`);
    await this.save();
  }

  async submitCheckin(taskId: string, photoUri: string, explanation: string) {
    const me = this.me();
    const t = this.s.tasks.find((x) => x.id === taskId);
    if (!t || t.ownerId !== me.id) throw new Error('Task not found');
    if (t.status !== 'active') throw new Error('This task is not active');
    if (!validExplanation(explanation)) throw new Error(`Explain what you did in at least ${RULES.minExplanationChars} characters`);
    if (!photoUri) throw new Error('A photo is required');
    const { date, time } = this.local();
    if (!inWindow(time, t.windowStart, t.windowEnd)) throw new Error(`Outside the check-in window (${t.windowStart} to ${t.windowEnd})`);
    const path = `${t.groupId}/${me.id}/${id()}.jpg`;
    this.s.photos[path] = photoUri;
    let c = this.s.checkins.find((x) => x.taskId === taskId && x.date === date);
    if (c) {
      if (c.photoPath) delete this.s.photos[c.photoPath];
      Object.assign(c, { photoPath: path, explanation: explanation.trim(), status: 'submitted', createdAt: iso(this.now()) });
    } else {
      c = { id: id(), taskId, groupId: t.groupId, ownerId: me.id, date, photoPath: path, explanation: explanation.trim(), status: 'submitted', createdAt: iso(this.now()) };
      this.s.checkins.push(c);
    }
    await this.save();
    return clone(c);
  }

  async reviewCheckin(checkinId: string, decision: Decision) {
    const me = this.me();
    const c = this.s.checkins.find((x) => x.id === checkinId);
    if (!c) throw new Error('Check-in not found');
    if (c.ownerId === me.id) throw new Error('You cannot review your own check-in');
    this.s.verifications = this.s.verifications.filter((v) => !(v.checkinId === checkinId && v.reviewerId === me.id));
    this.s.verifications.push({ id: id(), checkinId, reviewerId: me.id, decision, createdAt: iso(this.now()) });
    c.status = decision === 'approve' ? 'approved' : 'questioned';
    await this.save();
  }

  async addComment(checkinId: string, body: string) {
    if (!body.trim()) throw new Error('Write a comment first');
    this.s.comments.push({ id: id(), checkinId, authorId: this.me().id, body: body.trim(), createdAt: iso(this.now()) });
    await this.save();
  }

  async postStatement(strikeId: string, statement: string) {
    const st = this.s.strikes.find((x) => x.id === strikeId);
    if (!st || st.userId !== this.me().id) throw new Error('Strike not found');
    if (st.outcome !== 'pending') throw new Error('This strike is already settled');
    if (st.statementAt) throw new Error('You already posted a statement');
    if (!statement.trim()) throw new Error('Write a statement first');
    st.statement = statement.trim();
    st.statementAt = iso(this.now());
    // Demo friends read it and vote. Two say excuse, one is strict.
    const voters = this.members(st.groupId).filter((u) => u.startsWith('bot-'));
    voters.forEach((voterId, i) => this.s.votes.push({ strikeId, voterId, choice: i === 2 ? 'uphold' : 'excuse' }));
    await this.save();
    await this.settle(st.groupId);
  }

  async castVote(strikeId: string, choice: VoteChoice) {
    const me = this.me();
    const st = this.s.strikes.find((x) => x.id === strikeId);
    if (!st) throw new Error('Strike not found');
    if (st.userId === me.id) throw new Error('You cannot vote on your own strike');
    if (st.outcome !== 'pending') throw new Error('This vote is closed');
    if (!st.statementAt) throw new Error('There is no statement to vote on yet');
    this.s.votes = this.s.votes.filter((v) => !(v.strikeId === strikeId && v.voterId === me.id));
    this.s.votes.push({ strikeId, voterId: me.id, choice });
    await this.save();
    await this.settle(st.groupId);
  }

  async nudge(groupId: string, toId: string) {
    const key = `${groupId}:${toId}:${this.local().date}`;
    if (this.s.nudges.includes(key)) throw new Error('You already nudged them today');
    this.s.nudges.push(key);
    await this.save();
  }

  // ── Safety ─────────────────────────────────────────────────────────────────────────────────

  async report(_input: NewReport) {
    // The demo has nobody to send a report to; the real backend stores it for review.
  }

  async listBlocked() {
    await this.load();
    return [...this.s.blocked];
  }

  async block(userId: string) {
    if (!this.s.blocked.includes(userId)) this.s.blocked.push(userId);
    await this.save();
  }

  async unblock(userId: string) {
    this.s.blocked = this.s.blocked.filter((b) => b !== userId);
    await this.save();
  }

  async photoUrl(path: string | null) {
    return path ? (this.s.photos[path] ?? null) : null;
  }

  // ── Demo controls ──────────────────────────────────────────────────────────────────────────

  /** Friends finish (or miss) today, the day ends, strikes and the streak are settled, a new day starts. */
  async demoAdvanceDay() {
    const me = this.me();
    const { date: today } = this.local();
    for (const g of await this.listGroups()) {
      for (const botId of this.members(g.id).filter((u) => u.startsWith('bot-'))) {
        const has = this.s.checkins.some((c) => c.groupId === g.id && c.ownerId === botId && c.date === today);
        // Sam is the unreliable one: misses every third day.
        const misses = botId === 'bot-sam' && Number(today.slice(-2)) % 3 === 0;
        if (!has && !misses) this.botCheckin(g.id, botId, today).status = 'approved';
      }
      // Friends approve whatever you sent today.
      for (const c of this.s.checkins) {
        if (c.groupId === g.id && c.ownerId === me.id && c.date === today && c.status === 'submitted') {
          c.status = 'approved';
          this.s.verifications.push({ id: id(), checkinId: c.id, reviewerId: 'bot-maya', decision: 'approve', createdAt: iso(this.now()) });
        }
      }
    }
    this.s.clockOffset += DAY;
    const tomorrow = this.local().date;
    for (const g of await this.listGroups()) {
      await this.settle(g.id);
      // A struck friend explains themselves so there is something to vote on.
      for (const st of this.s.strikes) {
        if (st.groupId === g.id && st.outcome === 'pending' && !st.statementAt && st.userId.startsWith('bot-')) {
          st.statement = 'Slept through my alarm after a late shift. No excuse really, but I am back on it today.';
          st.statementAt = iso(this.now());
        }
      }
      this.botCheckin(g.id, 'bot-maya', tomorrow);
    }
    await this.save();
  }

  async demoReset() {
    await this.signOut();
  }
}

const iso = (ms: number) => new Date(ms).toISOString();
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const code = () => Array.from({ length: 6 }, () => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 31)]).join('');

function botTask(groupId: string, botId: string, activeFrom: string, createdMs: number): Task {
  return {
    id: id(), groupId, ownerId: botId, creatorId: botId, title: BOT_TASKS[botId]!.title,
    schedule: { kind: 'daily' }, windowStart: '06:00', windowEnd: '22:00', status: 'active',
    activeFrom, createdAt: iso(createdMs),
  };
}
