import { router } from 'expo-router';
import { View } from 'react-native';
import { RULES, activeTaskCount, type Task } from '@domain';

import { confirm } from '@/lib/confirm';
import { useGroup } from '@/state/app';
import { member, scheduleLabel, taskStreak, windowLabel } from '@/state/select';
import { Button, Card, Empty, Pill, Screen, Section, T } from '@/ui/components';
import { colors, space } from '@/ui/theme';

export default function TasksTab() {
  const { backend, snap, me, today, run } = useGroup();
  const mine = snap.tasks.filter((t) => t.ownerId === me.id);
  const pending = mine.filter((t) => t.status === 'pending');
  const active = mine.filter((t) => t.status === 'active');
  const paused = mine.filter((t) => t.status === 'paused');
  const ended = mine.filter((t) => t.status === 'ended').slice(-5).reverse();
  const sent = snap.tasks.filter((t) => t.creatorId === me.id && t.ownerId !== me.id && t.status === 'pending');
  const used = activeTaskCount(snap.tasks, me.id);

  const end = async (t: Task) => {
    if (await confirm('End this task?', `"${t.title}" will stop counting from today. Its history stays.`, 'End task', true)) {
      await run(() => backend.setTaskStatus(t.id, 'ended'), 'Task ended');
    }
  };

  const meta = (t: Task) => `${scheduleLabel(t.schedule, today)} · ${windowLabel(t)}`;
  const count = (t: Task) => snap.checkins.filter((c) => c.taskId === t.id && c.status !== 'questioned').length;

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <T v="title" accessibilityRole="header">My Tasks</T>
          <T v="small" color={colors.muted}>{used} of {RULES.maxActiveTasks} task slots used</T>
        </View>
        <Button small icon="add" label="New" onPress={() => router.push('/task/new')} testID="new-task" />
      </View>

      {pending.length > 0 && (
        <Section title="Waiting for your answer">
          {pending.map((t) => (
            <Card key={t.id} tone="blue">
              <View style={{ gap: 2 }}>
                <T v="heading">{t.title}</T>
                <T v="small" color={colors.muted}>From {member(snap, t.creatorId).displayName} · {meta(t)}</T>
              </View>
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <Button small kind="success" label="Accept" style={{ flex: 1 }} onPress={() => run(() => backend.setTaskStatus(t.id, 'active'), 'Task accepted')} />
                <Button small kind="ghost" label="Decline" style={{ flex: 1 }} onPress={() => run(() => backend.setTaskStatus(t.id, 'declined'))} />
              </View>
            </Card>
          ))}
        </Section>
      )}

      <Section title="Active">
        {active.length === 0 ? (
          <Card>
            <Empty icon="checkbox-outline" title="No active tasks" body="Add up to three. Friends can also set tasks for you to accept." action={<Button small label="Add a task" onPress={() => router.push('/task/new')} />} />
          </Card>
        ) : (
          active.map((t) => {
            const streak = taskStreak(snap, t, today);
            return (
              <Card key={t.id}>
                <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start' }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <T v="heading">{t.title}</T>
                    <T v="small" color={colors.muted}>{meta(t)}</T>
                    {t.creatorId !== me.id && <T v="small" color={colors.muted}>Set by {member(snap, t.creatorId).displayName}</T>}
                  </View>
                  <Pill tone={streak > 0 ? 'amber' : 'grey'} icon="flame" label={`${streak} in a row`} />
                </View>
                <T v="small" color={colors.muted}>{count(t)} check-ins in total{t.activeFrom && t.activeFrom > today ? ' · starts tomorrow' : ''}</T>
                <View style={{ flexDirection: 'row', gap: space.sm }}>
                  <Button small kind="ghost" icon="pause" label="Pause" style={{ flex: 1 }} onPress={() => run(() => backend.setTaskStatus(t.id, 'paused'), 'Task paused')} />
                  <Button small kind="ghost" icon="stop-circle-outline" label="End" style={{ flex: 1 }} onPress={() => end(t)} />
                </View>
              </Card>
            );
          })
        )}
      </Section>

      {paused.length > 0 && (
        <Section title="Paused">
          {paused.map((t) => (
            <Card key={t.id}>
              <View style={{ gap: 2 }}>
                <T v="heading">{t.title}</T>
                <T v="small" color={colors.muted}>{meta(t)} · paused tasks never cause a strike</T>
              </View>
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <Button small kind="soft" icon="play" label="Resume" style={{ flex: 1 }} onPress={() => run(() => backend.setTaskStatus(t.id, 'active'), 'Task resumed')} />
                <Button small kind="ghost" label="End" style={{ flex: 1 }} onPress={() => end(t)} />
              </View>
            </Card>
          ))}
        </Section>
      )}

      {sent.length > 0 && (
        <Section title="You set these for friends">
          {sent.map((t) => (
            <Card key={t.id}>
              <View style={{ gap: 2 }}>
                <T v="label">{t.title}</T>
                <T v="small" color={colors.muted}>For {member(snap, t.ownerId).displayName} · waiting for them to accept</T>
              </View>
              <Button small kind="ghost" label="Withdraw" onPress={() => run(() => backend.setTaskStatus(t.id, 'declined'), 'Withdrawn')} />
            </Card>
          ))}
        </Section>
      )}

      {ended.length > 0 && (
        <Section title="History">
          <Card>
            {ended.map((t) => (
              <View key={t.id} style={{ gap: 2 }}>
                <T v="label">{t.title}</T>
                <T v="small" color={colors.muted}>Ended · {count(t)} check-ins</T>
              </View>
            ))}
          </Card>
        </Section>
      )}
    </Screen>
  );
}
