import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type {
  Checkin,
  Comment,
  Decision,
  Group,
  GroupSnapshot,
  Member,
  Schedule,
  Strike,
  Task,
  TaskStatus,
  Verification,
  Vote,
  VoteChoice,
} from '@domain';
import { addDays, localDate } from '@domain';

import { avatarColors } from '@/ui/theme';

import type { Backend, Me, NewReport, NewTask } from './backend';

/* eslint-disable @typescript-eslint/no-explicit-any -- rows are mapped to typed objects right here */
type Row = Record<string, any>;

const HISTORY_DAYS = 62; // enough for the calendar's previous month
const hhmm = (t: string) => t.slice(0, 5);

const toGroup = (g: Row): Group => ({
  id: g.id, name: g.name, forfeit: g.forfeit, inviteCode: g.invite_code, currentStreak: g.current_streak,
  bestStreak: g.best_streak, lastClosedDate: g.last_closed_date, createdAt: g.created_at,
});
const toTask = (t: Row): Task => ({
  id: t.id, groupId: t.group_id, ownerId: t.owner_id, creatorId: t.creator_id ?? t.owner_id, title: t.title,
  schedule: t.schedule as Schedule, windowStart: hhmm(t.window_start), windowEnd: hhmm(t.window_end),
  status: t.status, activeFrom: t.active_from, createdAt: t.created_at,
});
const toCheckin = (c: Row): Checkin => ({
  id: c.id, taskId: c.task_id, groupId: c.group_id, ownerId: c.owner_id, date: c.date, photoPath: c.photo_path,
  explanation: c.explanation, status: c.status, createdAt: c.created_at,
});
const toStrike = (s: Row): Strike => ({
  id: s.id, groupId: s.group_id, userId: s.user_id, date: s.date, statement: s.statement, statementAt: s.statement_at,
  outcome: s.outcome, resolvedAt: s.resolved_at, createdAt: s.created_at,
});

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

/** The real backend. Reads go through row-level security; writes go through the database functions. */
export class SupabaseBackend implements Backend {
  readonly mode = 'live' as const;
  private db: SupabaseClient;
  private urls = new Map<string, { url: string; expires: number }>();

  constructor(url: string, anonKey: string) {
    this.db = createClient(url, anonKey, {
      auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
    });
  }

  now() {
    return Date.now();
  }

  private async uid(): Promise<string> {
    const { data } = await this.db.auth.getSession();
    const id = data.session?.user.id;
    if (!id) throw new Error('Not signed in');
    return id;
  }

  // ── Account ────────────────────────────────────────────────────────────────────────────────

  async getMe(): Promise<Me | null> {
    const { data } = await this.db.auth.getSession();
    const user = data.session?.user;
    if (!user) return null;
    const p = check(await this.db.from('profiles').select('*').eq('id', user.id).maybeSingle());
    if (!p) return null;
    return {
      id: p.id, displayName: p.display_name, timezone: p.timezone, avatarColor: p.avatar_color,
      email: user.email ?? null, notifyNudges: p.notify_nudges,
    };
  }

  async signUp({ email, password, displayName }: { email: string; password: string; displayName: string }) {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const avatar_color = avatarColors[Math.floor(Math.random() * avatarColors.length)];
    const { data, error } = await this.db.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { display_name: displayName.trim(), timezone, avatar_color } },
    });
    if (error) throw new Error(error.message);
    if (!data.session) throw new Error('Check your email to confirm your account, then sign in.');
    const me = await this.getMe();
    if (!me) throw new Error('Your profile could not be created. Try signing in.');
    return me;
  }

  async signIn(email: string, password: string) {
    const { error } = await this.db.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw new Error(error.message);
    const me = await this.getMe();
    if (!me) throw new Error('Profile not found');
    // Keep the timezone current: it decides when this member's day ends.
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return timezone && timezone !== me.timezone ? this.updateProfile({ timezone }) : me;
  }

  async signOut() {
    await this.db.auth.signOut();
  }

  async deleteAccount() {
    const { error } = await this.db.functions.invoke('delete-account');
    if (error) throw new Error('Your account could not be deleted. Try again, or contact support.');
    await this.db.auth.signOut();
  }

  async updateProfile(patch: Partial<Pick<Me, 'displayName' | 'timezone' | 'notifyNudges'>> & { pushToken?: string | null }) {
    const row: Row = {};
    if (patch.displayName !== undefined) row.display_name = patch.displayName.trim();
    if (patch.timezone !== undefined) row.timezone = patch.timezone;
    if (patch.notifyNudges !== undefined) row.notify_nudges = patch.notifyNudges;
    if (patch.pushToken !== undefined) row.push_token = patch.pushToken;
    check(await this.db.from('profiles').update(row).eq('id', await this.uid()));
    return (await this.getMe())!;
  }

  // ── Groups ─────────────────────────────────────────────────────────────────────────────────

  async listGroups() {
    const rows = check(await this.db.from('groups').select('*').order('created_at'));
    return (rows ?? []).map(toGroup);
  }

  async createGroup(name: string, forfeit: string) {
    return toGroup(check(await this.db.rpc('create_group', { p_name: name, p_forfeit: forfeit })));
  }

  async joinGroup(code: string) {
    return toGroup(check(await this.db.rpc('join_group', { p_code: code })));
  }

  async leaveGroup(groupId: string) {
    check(await this.db.rpc('leave_group', { p_group: groupId }));
  }

  async updateGroup(groupId: string, name: string, forfeit: string) {
    check(await this.db.rpc('update_group', { p_group: groupId, p_name: name, p_forfeit: forfeit }));
  }

  async getSnapshot(groupId: string): Promise<GroupSnapshot> {
    const since = addDays(localDate(Date.now(), 'UTC'), -HISTORY_DAYS);
    const [g, m, t, c, s] = await Promise.all([
      this.db.from('groups').select('*').eq('id', groupId).single(),
      this.db.from('memberships').select('role, joined_at, profiles(id, display_name, timezone, avatar_color)').eq('group_id', groupId).is('left_at', null).order('joined_at'),
      this.db.from('tasks').select('*').eq('group_id', groupId).order('created_at'),
      this.db.from('checkins').select('*').eq('group_id', groupId).gte('date', since).order('created_at'),
      this.db.from('strikes').select('*').eq('group_id', groupId).gte('date', since).order('created_at'),
    ]);
    const checkins = (check(c) ?? []).map(toCheckin);
    const strikes = (check(s) ?? []).map(toStrike);
    const cids = checkins.map((x) => x.id);
    const sids = strikes.map((x) => x.id);
    const none = { data: [] as Row[], error: null };
    const [v, cm, vo] = await Promise.all([
      cids.length ? this.db.from('verifications').select('*').in('checkin_id', cids) : none,
      cids.length ? this.db.from('comments').select('*').in('checkin_id', cids).order('created_at') : none,
      sids.length ? this.db.from('votes').select('*').in('strike_id', sids) : none,
    ]);
    const members: Member[] = (check(m) ?? []).map((row: Row) => ({
      id: row.profiles.id, displayName: row.profiles.display_name, timezone: row.profiles.timezone,
      avatarColor: row.profiles.avatar_color, role: row.role, joinedAt: row.joined_at,
    }));
    return {
      group: toGroup(check(g)),
      members,
      tasks: (check(t) ?? []).map(toTask),
      checkins,
      strikes,
      verifications: (check(v) ?? []).map((x: Row): Verification => ({ id: x.id, checkinId: x.checkin_id, reviewerId: x.reviewer_id, decision: x.decision, createdAt: x.created_at })),
      comments: (check(cm) ?? []).map((x: Row): Comment => ({ id: x.id, checkinId: x.checkin_id, authorId: x.author_id, body: x.body, createdAt: x.created_at })),
      votes: (check(vo) ?? []).map((x: Row): Vote => ({ strikeId: x.strike_id, voterId: x.voter_id, choice: x.choice })),
    };
  }

  subscribe(groupId: string, onChange: () => void) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ping = () => {
      clearTimeout(timer);
      timer = setTimeout(onChange, 250); // several rows often change together
    };
    const channel = this.db.channel(`group:${groupId}`);
    for (const table of ['tasks', 'checkins', 'strikes', 'memberships']) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `group_id=eq.${groupId}` }, ping);
    }
    channel.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'groups', filter: `id=eq.${groupId}` }, ping);
    for (const table of ['verifications', 'comments', 'votes']) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, ping);
    }
    channel.subscribe();
    return () => {
      clearTimeout(timer);
      void this.db.removeChannel(channel);
    };
  }

  async settle(groupId: string) {
    // Best effort: the hourly job settles everything anyway.
    await this.db.functions.invoke('end-of-day', { body: { groupId } }).catch(() => undefined);
  }

  // ── Tasks and check-ins ────────────────────────────────────────────────────────────────────

  async createTask(input: NewTask) {
    return toTask(check(await this.db.rpc('create_task', {
      p_group: input.groupId, p_owner: input.ownerId, p_title: input.title, p_schedule: input.schedule,
      p_window_start: input.windowStart, p_window_end: input.windowEnd,
    })));
  }

  async setTaskStatus(taskId: string, status: TaskStatus) {
    check(await this.db.rpc('set_task_status', { p_task: taskId, p_status: status }));
  }

  async submitCheckin(taskId: string, photoUri: string, explanation: string) {
    const uid = await this.uid();
    const task = check(await this.db.from('tasks').select('group_id').eq('id', taskId).single());
    // Compress on the device: a 1280px JPEG is plenty for proof and keeps uploads small.
    const rendered = await ImageManipulator.manipulate(photoUri).resize({ width: 1280 }).renderAsync();
    const saved = await rendered.saveAsync({ compress: 0.7, format: SaveFormat.JPEG, base64: true });
    if (!saved.base64) throw new Error('The photo could not be prepared. Try again.');
    const path = `${task!.group_id}/${uid}/${Date.now()}.jpg`;
    const upload = await this.db.storage.from('proofs').upload(path, decodeBase64(saved.base64), { contentType: 'image/jpeg' });
    if (upload.error) throw new Error(upload.error.message);
    const res = await this.db.rpc('submit_checkin', { p_task: taskId, p_photo_path: path, p_explanation: explanation });
    if (res.error) {
      await this.db.storage.from('proofs').remove([path]); // do not leave an orphaned photo behind
      throw new Error(res.error.message);
    }
    return toCheckin(res.data);
  }

  async reviewCheckin(checkinId: string, decision: Decision) {
    check(await this.db.rpc('review_checkin', { p_checkin: checkinId, p_decision: decision }));
  }

  async addComment(checkinId: string, body: string) {
    check(await this.db.from('comments').insert({ checkin_id: checkinId, author_id: await this.uid(), body }));
  }

  async postStatement(strikeId: string, statement: string) {
    const s = toStrike(check(await this.db.rpc('post_statement', { p_strike: strikeId, p_statement: statement })));
    await this.settle(s.groupId);
  }

  async castVote(strikeId: string, choice: VoteChoice) {
    check(await this.db.rpc('cast_vote', { p_strike: strikeId, p_choice: choice }));
    const s = check(await this.db.from('strikes').select('group_id').eq('id', strikeId).single());
    await this.settle(s!.group_id);
  }

  async nudge(groupId: string, toId: string) {
    const me = await this.getMe();
    const res = await this.db.from('nudges')
      .insert({ group_id: groupId, from_id: me!.id, to_id: toId, date: localDate(Date.now(), me!.timezone) })
      .select('id').single();
    if (res.error) throw new Error(res.error.code === '23505' ? 'You already nudged them today' : res.error.message);
    await this.db.functions.invoke('nudge', { body: { nudgeId: res.data.id } }).catch(() => undefined);
  }

  // ── Safety ─────────────────────────────────────────────────────────────────────────────────

  async report(input: NewReport) {
    check(await this.db.from('reports').insert({
      reporter_id: await this.uid(), target_user_id: input.targetUserId, checkin_id: input.checkinId, reason: input.reason,
    }));
  }

  async listBlocked() {
    const rows = check(await this.db.from('blocks').select('blocked_id'));
    return (rows ?? []).map((r: Row) => r.blocked_id as string);
  }

  async block(userId: string) {
    check(await this.db.from('blocks').upsert({ blocker_id: await this.uid(), blocked_id: userId }));
  }

  async unblock(userId: string) {
    check(await this.db.from('blocks').delete().eq('blocker_id', await this.uid()).eq('blocked_id', userId));
  }

  async photoUrl(path: string | null) {
    if (!path) return null;
    const hit = this.urls.get(path);
    if (hit && hit.expires > Date.now()) return hit.url;
    // Photos are private: every view uses a short-lived signed URL.
    const { data } = await this.db.storage.from('proofs').createSignedUrl(path, 3600);
    if (!data) return null;
    this.urls.set(path, { url: data.signedUrl, expires: Date.now() + 50 * 60_000 });
    return data.signedUrl;
  }
}

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
