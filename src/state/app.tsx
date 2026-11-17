import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { localNow, type DateStr, type Group, type GroupSnapshot, type TimeStr } from '@domain';

import { backend, type Backend, type Me } from '@/data';
import { syncReminders } from '@/lib/notifications';

interface Toast {
  id: number;
  text: string;
  kind: 'error' | 'ok';
}

interface AppValue {
  backend: Backend;
  /** False until the first load has finished. */
  ready: boolean;
  me: Me | null;
  groups: Group[];
  snap: GroupSnapshot | null;
  blocked: string[];
  /** Today's date and the current time in the signed-in member's timezone. */
  today: DateStr;
  time: TimeStr;
  toast: Toast | null;
  refresh: () => Promise<void>;
  /** Run an action, show any error as a toast, then reload. Resolves true when it worked. */
  run: (action: () => Promise<unknown>, done?: string) => Promise<boolean>;
  notify: (text: string, kind?: Toast['kind']) => void;
  selectGroup: (groupId: string) => void;
}

const Ctx = createContext<AppValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [snap, setSnap] = useState<GroupSnapshot | null>(null);
  const [blocked, setBlocked] = useState<string[]>([]);
  const [tick, setTick] = useState(0);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const wanted = useRef<string | null>(null);
  wanted.current = groupId;

  const notify = useCallback((text: string, kind: Toast['kind'] = 'ok') => {
    clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), text, kind });
    toastTimer.current = setTimeout(() => setToast(null), kind === 'error' ? 5000 : 2600);
  }, []);

  const refresh = useCallback(async () => {
    const user = await backend.getMe();
    setMe(user);
    if (!user) {
      setGroups([]);
      setSnap(null);
      setBlocked([]);
      setReady(true);
      return;
    }
    const [list, blockedIds] = await Promise.all([backend.listGroups(), backend.listBlocked()]);
    const current = list.find((g) => g.id === wanted.current) ?? list[0] ?? null;
    setGroups(list);
    setBlocked(blockedIds);
    setGroupId(current?.id ?? null);
    setSnap(current ? await backend.getSnapshot(current.id) : null);
    setTick((n) => n + 1);
    setReady(true);
  }, []);

  const run = useCallback<AppValue['run']>(
    async (action, done) => {
      try {
        await action();
        await refresh();
        if (done) notify(done);
        return true;
      } catch (e) {
        notify(e instanceof Error ? e.message : 'Something went wrong. Try again.', 'error');
        return false;
      }
    },
    [refresh, notify],
  );

  // First load.
  useEffect(() => {
    refresh().catch(() => {
      setReady(true);
      notify('Could not load your data. Check your connection.', 'error');
    });
  }, [refresh, notify]);

  // Live updates for the open group, plus a settle pass so finished days close promptly.
  useEffect(() => {
    if (!groupId) return;
    void backend.settle(groupId).then(refresh).catch(() => undefined);
    return backend.subscribe(groupId, () => void refresh().catch(() => undefined));
  }, [groupId, refresh]);

  // Keep the clock moving and reload when the app comes back to the foreground.
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 30_000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh().catch(() => undefined);
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [refresh]);

  // Reminders follow your own tasks.
  const myTasks = useMemo(() => (me && snap ? snap.tasks.filter((t) => t.ownerId === me.id) : []), [me, snap]);
  const reminderKey = myTasks.map((t) => `${t.id}:${t.status}:${t.windowStart}:${t.windowEnd}`).join('|');
  useEffect(() => {
    void syncReminders(myTasks).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reminderKey captures every field that matters
  }, [reminderKey]);

  const value = useMemo<AppValue>(() => {
    const { date, time } = localNow(backend.now(), me?.timezone ?? 'UTC');
    return {
      backend, ready, me, groups, snap, blocked, today: date, time, toast, refresh, run, notify,
      selectGroup: (id: string) => {
        setGroupId(id);
        wanted.current = id;
        void refresh();
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tick advances the clock
  }, [ready, me, groups, snap, blocked, toast, refresh, run, notify, tick]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside AppProvider');
  return v;
}

/** For screens that only render with a signed-in member in a group. */
export function useGroup() {
  const app = useApp();
  if (!app.me || !app.snap) throw new Error('This screen needs a group');
  return { ...app, me: app.me, snap: app.snap };
}
