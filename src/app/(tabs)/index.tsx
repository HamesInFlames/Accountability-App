import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring } from 'react-native-reanimated';
import { inWindow, memberDay, type Task } from '@domain';

import { useGroup } from '@/state/app';
import { myOpenStrikes, myToday, pendingForMe, reviewQueue, votesNeeded, weekDots, windowLabel } from '@/state/select';
import { Avatar, Button, Card, Empty, Pill, Screen, Section, T } from '@/ui/components';
import { CheckinRow, StatusPill, StrikeRow } from '@/ui/parts';
import { colors, space } from '@/ui/theme';

export default function Home() {
  const { backend, snap, me, today, time, blocked, run } = useGroup();
  const mine = myToday(snap, me.id, today);
  const queue = reviewQueue(snap, me.id, today, blocked);
  const strikes = [...myOpenStrikes(snap, me.id), ...votesNeeded(snap, me.id)];
  const pending = pendingForMe(snap, me.id);
  const friends = snap.members.filter((m) => m.id !== me.id && !blocked.includes(m.id));
  const hasAnyTask = snap.tasks.some((t) => t.ownerId === me.id && t.status === 'active');

  return (
    <Screen>
      <View>
        <T v="small" color={colors.muted}>{snap.group.name}</T>
        <T v="title" accessibilityRole="header">Hi {me.displayName}</T>
      </View>

      <StreakCard streak={snap.group.currentStreak} best={snap.group.bestStreak} dots={weekDots(snap, today)} />

      {strikes.length > 0 && (
        <Section title="Needs you now">
          {strikes.map((s) => <StrikeRow key={s.id} snap={snap} strike={s} meId={me.id} today={today} />)}
        </Section>
      )}

      {pending.length > 0 && (
        <Section title="Set for you by a friend">
          {pending.map((t) => (
            <Card key={t.id} tone="blue">
              <View style={{ gap: 2 }}>
                <T v="label">{t.title}</T>
                <T v="small" color={colors.muted}>
                  From {snap.members.find((m) => m.id === t.creatorId)?.displayName ?? 'a friend'} · check in {windowLabel(t)}
                </T>
              </View>
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <Button small kind="success" label="Accept" style={{ flex: 1 }} onPress={() => run(() => backend.setTaskStatus(t.id, 'active'), 'Task accepted')} testID="accept-task" />
                <Button small kind="ghost" label="Decline" style={{ flex: 1 }} onPress={() => run(() => backend.setTaskStatus(t.id, 'declined'))} />
              </View>
            </Card>
          ))}
        </Section>
      )}

      <Section title="Your tasks today">
        {mine.length === 0 ? (
          <Card>
            <Empty
              icon={hasAnyTask ? 'bed-outline' : 'add-circle-outline'}
              title={hasAnyTask ? 'Rest day' : 'No tasks yet'}
              body={hasAnyTask ? 'Nothing is due today. Rest days never break the streak.' : 'Add a task and your group will hold you to it.'}
              action={!hasAnyTask ? <Button small label="Add a task" onPress={() => router.push('/task/new')} /> : undefined}
            />
          </Card>
        ) : (
          mine.map(({ task, checkin }) => (
            <Card key={task.id}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md, alignItems: 'flex-start' }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <T v="heading">{task.title}</T>
                  <T v="small" color={colors.muted}>Check in {windowLabel(task)}</T>
                </View>
                {checkin && <StatusPill status={checkin.status} />}
              </View>
              <TaskAction task={task} hasCheckin={!!checkin} questioned={checkin?.status === 'questioned'} time={time} checkinId={checkin?.id} />
            </Card>
          ))
        )}
      </Section>

      {queue.length > 0 && (
        <Section title="Waiting for your approval">
          {queue.map((c) => <CheckinRow key={c.id} snap={snap} checkin={c} today={today} showStatus={false} />)}
        </Section>
      )}

      <Section title="Friends today">
        {friends.length === 0 ? (
          <Card>
            <Empty icon="person-add-outline" title="It is just you so far" body="Invite at least two friends from the Group tab. The streak starts when they join." />
          </Card>
        ) : (
          <Card>
            {friends.map((m) => {
              const day = memberDay(m.id, today, snap.tasks, snap.checkins);
              return (
                <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48 }}>
                  <Avatar name={m.displayName} color={m.avatarColor} />
                  <View style={{ flex: 1 }}>
                    <T v="label">{m.displayName}</T>
                    <T v="small" color={colors.muted}>
                      {day.status === 'rest' ? 'Rest day' : `${day.done.length} of ${day.due.length} done`}
                    </T>
                  </View>
                  {day.status === 'complete' ? (
                    <Pill tone="green" icon="checkmark-circle" label="Done" />
                  ) : day.status === 'missed' ? (
                    <Button small kind="soft" icon="hand-left-outline" label="Nudge" onPress={() => run(() => backend.nudge(snap.group.id, m.id), `Nudged ${m.displayName}`)} />
                  ) : null}
                </View>
              );
            })}
          </Card>
        )}
      </Section>
    </Screen>
  );
}

function TaskAction({ task, hasCheckin, questioned, time, checkinId }: { task: Task; hasCheckin: boolean; questioned: boolean; time: string; checkinId?: string }) {
  const open = inWindow(time, task.windowStart, task.windowEnd);
  const go = () => router.push({ pathname: '/checkin/[taskId]', params: { taskId: task.id } });
  if (hasCheckin && !questioned) {
    return <Button small kind="ghost" label="View my proof" onPress={() => router.push({ pathname: '/proof/[id]', params: { id: checkinId! } })} />;
  }
  if (!open) {
    return (
      <T v="small" color={time < task.windowStart ? colors.muted : colors.red}>
        {time < task.windowStart ? `The window opens at ${task.windowStart}.` : `The window closed at ${task.windowEnd}. This will count as a miss when the day ends.`}
      </T>
    );
  }
  return <Button icon="camera" label={questioned ? 'Retake proof' : 'Check in'} onPress={go} testID="check-in" />;
}

function StreakCard({ streak, best, dots }: { streak: number; best: number; dots: ReturnType<typeof weekDots> }) {
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withSequence(withSpring(1.18, { damping: 6, stiffness: 220 }), withSpring(1, { damping: 10 }));
  }, [streak, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const labels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  return (
    <Card tone="amber" style={{ gap: space.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }} accessible accessibilityLabel={`Group streak: ${streak} ${streak === 1 ? 'day' : 'days'}. Best: ${best}.`}>
        <Animated.View style={[{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.amberBright, alignItems: 'center', justifyContent: 'center' }, style]}>
          <Ionicons name="flame" size={40} color={colors.onAmber} />
        </Animated.View>
        <View style={{ flex: 1 }}>
          <T v="display" style={{ fontSize: 44, lineHeight: 48 }} testID="streak">{streak}</T>
          <T v="label" color="#92400E">day group streak · best {best}</T>
        </View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {dots.map((d, i) => {
          const sunday = i === 6;
          const bg = d.state === 'done' ? colors.green : d.state === 'missed' ? colors.red : 'transparent';
          const border = d.state === 'done' ? colors.green : d.state === 'missed' ? colors.red : d.state === 'today' ? colors.amber : '#E7C98F';
          const fg = d.state === 'done' || d.state === 'missed' ? colors.white : '#92400E';
          const say = { done: 'everyone done', missed: 'someone missed', rest: 'rest day', today: 'today, in progress', future: 'upcoming' }[d.state];
          return (
            <View key={d.date} style={{ alignItems: 'center', gap: 4 }} accessible accessibilityLabel={`${['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][i]}: ${say}${sunday ? ', finish line' : ''}`}>
              <View style={{ width: 34, height: 34, borderRadius: 17, borderWidth: d.state === 'today' ? 3 : 2, borderColor: border, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
                {d.state === 'done' ? <Ionicons name="checkmark" size={18} color={fg} />
                  : d.state === 'missed' ? <Ionicons name="close" size={18} color={fg} />
                  : sunday ? <Ionicons name="flag" size={15} color={fg} /> : null}
              </View>
              <T v="small" color="#92400E">{labels[i]}</T>
            </View>
          );
        })}
      </View>
      <Button small kind="ghost" icon="trophy-outline" label="This week's recap" onPress={() => router.push('/recap')} style={{ backgroundColor: colors.card }} />
    </Card>
  );
}
