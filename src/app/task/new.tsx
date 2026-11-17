import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { canTakeTask, RULES } from '@domain';

import { useGroup } from '@/state/app';
import { Button, Card, Chip, Header, Screen, T } from '@/ui/components';
import { draftError, emptyDraft, TaskForm } from '@/ui/TaskForm';
import { colors, space } from '@/ui/theme';

/** New task, for yourself or for a friend. A task set for a friend waits for them to accept it. */
export default function NewTask() {
  const params = useLocalSearchParams<{ ownerId?: string; date?: string }>();
  const { backend, snap, me, today, run, blocked } = useGroup();
  const [ownerId, setOwnerId] = useState(params.ownerId ?? me.id);
  const [draft, setDraft] = useState(emptyDraft(params.date));
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);

  const mine = ownerId === me.id;
  const full = mine && !canTakeTask(snap.tasks, me.id);
  const owner = snap.members.find((m) => m.id === ownerId);

  const save = async () => {
    setTried(true);
    if (draftError(draft, today) || full) return;
    setBusy(true);
    const ok = await run(
      () => backend.createTask({ groupId: snap.group.id, ownerId, ...draft }),
      mine ? 'Task added' : `Sent to ${owner?.displayName}. It starts when they accept.`,
    );
    setBusy(false);
    if (ok) router.back();
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="New task" />
      <View style={{ gap: space.sm }}>
        <T v="label">Who is it for?</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {snap.members.filter((m) => !blocked.includes(m.id)).map((m) => (
            <Chip key={m.id} label={m.id === me.id ? 'Me' : m.displayName} selected={ownerId === m.id} onPress={() => setOwnerId(m.id)} />
          ))}
        </View>
        {!mine && (
          <T v="small" color={colors.muted}>
            {owner?.displayName} has to accept it before it counts. People stick to goals they agree to.
          </T>
        )}
      </View>

      {full ? (
        <Card tone="amber">
          <T v="label">You already have {RULES.maxActiveTasks} active tasks</T>
          <T color={colors.muted}>End or finish one in My Tasks first. Three keeps a day achievable.</T>
        </Card>
      ) : (
        <>
          <Card>
            <TaskForm draft={draft} onChange={setDraft} today={today} showError={tried} />
          </Card>
          <Button label={mine ? 'Add task' : `Send to ${owner?.displayName ?? 'friend'}`} onPress={save} loading={busy} testID="save-task" />
        </>
      )}
    </Screen>
  );
}
