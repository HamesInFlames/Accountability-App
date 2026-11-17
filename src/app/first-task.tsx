import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, View } from 'react-native';
import { inWindow } from '@domain';

import { enableNotifications } from '@/lib/notifications';
import { shareInvite } from '@/lib/share';
import { useApp } from '@/state/app';
import { Button, Card, Screen, T } from '@/ui/components';
import { draftError, emptyDraft, TaskForm } from '@/ui/TaskForm';
import { colors, space } from '@/ui/theme';

/**
 * The rest of the first-run flow after creating or joining a group:
 * invite friends, add one task with a check-in window, allow reminders, then straight to the camera.
 */
export default function FirstTask() {
  const { backend, snap, me, today, time, run, notify } = useApp();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState(emptyDraft());
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  if (!snap || !me) return null;
  const alone = snap.members.length < 2;

  const invite = async () => {
    const how = await shareInvite(snap.group);
    if (how === 'copied') notify('Invite copied. Paste it into your group chat.');
  };

  const addTask = async () => {
    setTried(true);
    if (draftError(draft, today)) return;
    setBusy(true);
    const ok = await run(async () => {
      const t = await backend.createTask({ groupId: snap.group.id, ownerId: me.id, ...draft });
      setTaskId(t.id);
    });
    setBusy(false);
    if (ok) setStep(2);
  };

  const reminders = async () => {
    const { token } = await enableNotifications();
    if (token) await run(() => backend.updateProfile({ pushToken: token }));
    finish();
  };

  const finish = () => {
    router.replace('/');
    // Go straight to the camera when the window is open; otherwise say when it opens.
    if (!taskId) return;
    if (inWindow(time, draft.windowStart, draft.windowEnd)) router.push({ pathname: '/checkin/[taskId]', params: { taskId } });
    else notify(`You are set. Your check-in window opens at ${draft.windowStart}.`);
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={{ flexDirection: 'row', gap: space.xs, marginTop: space.md }} accessibilityRole="progressbar" accessibilityLabel="Setup progress" accessibilityValue={{ min: 1, max: 3, now: step + 1, text: `Step ${step + 1} of 3` }}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: i <= step ? colors.amberBright : colors.border }} />
        ))}
      </View>

      {step === 0 && (
        <>
          <View style={{ gap: space.xs }}>
            <T v="title" accessibilityRole="header">{alone ? 'Bring your friends in' : `You are in ${snap.group.name}`}</T>
            <T color={colors.muted}>
              {alone ? 'A group needs at least three people. Send the invite now, before you forget.' : `${snap.members.length} members so far. You can invite more, up to 8.`}
            </T>
          </View>
          <Card tone="amber" style={{ alignItems: 'center' }}>
            <T v="small" color={colors.muted}>Invite code</T>
            <T v="display" style={{ letterSpacing: 6 }} selectable testID="invite-code-display">{snap.group.inviteCode}</T>
            <Button icon="share-outline" label="Send invite" onPress={invite} style={{ alignSelf: 'stretch' }} />
          </Card>
          <Button kind={alone ? 'ghost' : 'primary'} label="Next: add your first task" onPress={() => setStep(1)} testID="next" />
        </>
      )}

      {step === 1 && (
        <>
          <View style={{ gap: space.xs }}>
            <T v="title" accessibilityRole="header">One thing you will do</T>
            <T color={colors.muted}>Start with a single task. You can have up to three, and friends can set more for you.</T>
          </View>
          <Card>
            <TaskForm draft={draft} onChange={setDraft} today={today} showError={tried} />
          </Card>
          <Button label="Add task" onPress={addTask} loading={busy} testID="add-task" />
        </>
      )}

      {step === 2 && (
        <>
          <View style={{ alignItems: 'center', gap: space.md, marginTop: space.xl }}>
            <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: colors.amberSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="notifications" size={40} color={colors.amber} />
            </View>
            <T v="title" center accessibilityRole="header">Get a reminder when your window opens</T>
            <T color={colors.muted} center>
              One reminder when the check-in window opens and one an hour before it closes. Nudges from friends arrive the same way.
            </T>
          </View>
          {Platform.OS === 'web' ? (
            <Button label={inWindow(time, draft.windowStart, draft.windowEnd) ? 'Take my first check-in' : 'Finish'} icon="camera" onPress={finish} testID="finish" />
          ) : (
            <>
              <Button label="Turn on reminders" icon="notifications-outline" onPress={reminders} testID="finish" />
              <Button kind="ghost" label="Not now" onPress={finish} />
            </>
          )}
        </>
      )}
    </Screen>
  );
}
