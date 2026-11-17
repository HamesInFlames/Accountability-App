import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { RULES, type Checkin, type CheckinStatus, type GroupSnapshot, type Strike } from '@domain';

import { backend } from '@/data';
import { member, prettyDate, taskOf } from '@/state/select';

import { Avatar, Photo, Pill, T } from './components';
import { colors, MIN_TOUCH, radius, shadow, space } from './theme';

/** Resolves a stored photo path to something displayable (a signed URL when live). */
export function usePhoto(path: string | null): string | null {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setUri(null);
    void backend.photoUrl(path).then((u) => alive && setUri(u)).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [path]);
  return uri;
}

export function StatusPill({ status }: { status: CheckinStatus }) {
  if (status === 'approved') return <Pill tone="green" icon="checkmark-circle" label="Approved" />;
  if (status === 'questioned') return <Pill tone="red" icon="help-circle" label="Questioned" />;
  return <Pill tone="amber" icon="time" label="Waiting for review" />;
}

/** One check-in in a list: thumbnail, who, what, when. Opens the proof screen. */
export function CheckinRow({ snap, checkin, today, showStatus = true }: { snap: GroupSnapshot; checkin: Checkin; today: string; showStatus?: boolean }) {
  const uri = usePhoto(checkin.photoPath);
  const who = member(snap, checkin.ownerId);
  const task = taskOf(snap, checkin);
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/proof/[id]', params: { id: checkin.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${who.displayName}, ${task?.title ?? 'task'}, ${prettyDate(checkin.date, today)}. Open proof.`}
      style={({ pressed }) => [{ flexDirection: 'row', gap: space.md, backgroundColor: colors.card, borderRadius: radius.lg, padding: space.md, alignItems: 'center' }, shadow, pressed && { opacity: 0.7 }]}>
      <Photo uri={uri} seed={checkin.id} label="" style={{ width: 72, aspectRatio: 1 }} />
      <View style={{ flex: 1, gap: 3 }}>
        <T v="label" numberOfLines={1}>{who.displayName} · {task?.title ?? 'Task'}</T>
        <T v="small" color={colors.muted} numberOfLines={2}>{checkin.explanation}</T>
        <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center', flexWrap: 'wrap' }}>
          {showStatus && <StatusPill status={checkin.status} />}
          <T v="small" color={colors.muted}>{prettyDate(checkin.date, today)}</T>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.faint} />
    </Pressable>
  );
}

/** Three dots: how many strikes a member has used this cycle. */
export function StrikeDots({ count }: { count: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 4 }} accessibilityLabel={`${count} of ${RULES.strikesPerCycle} strikes this week`} accessibilityRole="image">
      {Array.from({ length: RULES.strikesPerCycle }, (_, i) => (
        <View key={i} style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: i < count ? colors.red : colors.border }} />
      ))}
    </View>
  );
}

export function StrikeRow({ snap, strike, meId, today }: { snap: GroupSnapshot; strike: Strike; meId: string; today: string }) {
  const who = member(snap, strike.userId);
  const mine = strike.userId === meId;
  const label =
    strike.outcome === 'excused' ? 'Excused by the group'
    : strike.outcome === 'upheld' ? 'Strike upheld'
    : !strike.statementAt ? (mine ? 'Tell the group why' : 'Waiting for a statement')
    : mine ? 'The group is voting'
    : snap.votes.some((v) => v.strikeId === strike.id && v.voterId === meId) ? 'You voted' : 'Your vote is needed';
  const urgent = strike.outcome === 'pending' && (mine ? !strike.statementAt : label === 'Your vote is needed');
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/strike/[id]', params: { id: strike.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${mine ? 'Your' : who.displayName + "'s"} strike for ${prettyDate(strike.date, today)}. ${label}.`}
      style={({ pressed }) => [{ flexDirection: 'row', gap: space.md, alignItems: 'center', minHeight: MIN_TOUCH, backgroundColor: urgent ? colors.redSoft : colors.card, borderRadius: radius.lg, padding: space.md }, !urgent && shadow, pressed && { opacity: 0.7 }]}>
      <Avatar name={who.displayName} color={who.avatarColor} size={36} />
      <View style={{ flex: 1 }}>
        <T v="label">{mine ? 'You' : who.displayName} missed {prettyDate(strike.date, today)}</T>
        <T v="small" color={urgent ? '#991B1B' : colors.muted}>{label}</T>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.faint} />
    </Pressable>
  );
}
