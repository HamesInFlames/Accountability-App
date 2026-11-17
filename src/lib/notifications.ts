import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { Task } from '@domain';

const supported = Platform.OS !== 'web';

if (supported) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
}

export async function notificationsAllowed(): Promise<boolean> {
  if (!supported) return false;
  return (await Notifications.getPermissionsAsync()).granted;
}

/** Ask for permission and return this device's Expo push token, or null if unavailable. */
export async function enableNotifications(): Promise<{ granted: boolean; token: string | null }> {
  if (!supported) return { granted: false, token: null };
  let { granted } = await Notifications.getPermissionsAsync();
  if (!granted) granted = (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) return { granted: false, token: null };
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', { name: 'Reminders', importance: Notifications.AndroidImportance.DEFAULT });
  }
  let token: string | null = null;
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    // Push tokens need a real device and an EAS project; local reminders work without either.
    if (Device.isDevice && projectId) token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch {
    token = null;
  }
  return { granted: true, token };
}

/**
 * Local reminders for your own tasks: one when the check-in window opens and one an hour before it
 * closes. Rebuilt from scratch whenever your tasks change, so there are never stale reminders.
 */
export async function syncReminders(tasks: Task[]): Promise<void> {
  if (!supported || !(await notificationsAllowed())) return;
  await Notifications.cancelAllScheduledNotificationsAsync();
  for (const t of tasks) {
    if (t.status !== 'active') continue;
    const [sh, sm] = t.windowStart.split(':').map(Number) as [number, number];
    const [eh, em] = t.windowEnd.split(':').map(Number) as [number, number];
    const lastCall = Math.max(sh * 60 + sm + 1, eh * 60 + em - 60);
    const moments = [
      { hour: sh, minute: sm, title: t.title, body: 'Your check-in window is open.' },
      { hour: Math.floor(lastCall / 60), minute: lastCall % 60, title: `${t.title}: last call`, body: `Check in before ${t.windowEnd} to keep the streak alive.` },
    ];
    for (const m of moments) {
      const content = { title: m.title, body: m.body, data: { taskId: t.id } };
      if (t.schedule.kind === 'daily') {
        await Notifications.scheduleNotificationAsync({ content, trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: m.hour, minute: m.minute } });
      } else if (t.schedule.kind === 'weekdays') {
        for (const day of t.schedule.days) {
          // Expo weekdays run 1 (Sunday) to 7 (Saturday).
          await Notifications.scheduleNotificationAsync({ content, trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: day + 1, hour: m.hour, minute: m.minute } });
        }
      } else {
        const [y, mo, d] = t.schedule.date.split('-').map(Number) as [number, number, number];
        const when = new Date(y, mo - 1, d, m.hour, m.minute);
        if (when.getTime() > Date.now()) {
          await Notifications.scheduleNotificationAsync({ content, trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when } });
        }
      }
    }
  }
}
