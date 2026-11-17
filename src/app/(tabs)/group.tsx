import { router } from 'expo-router';
import { View } from 'react-native';
import { memberDay } from '@domain';

import { shareInvite } from '@/lib/share';
import { useGroup } from '@/state/app';
import { strikeCount } from '@/state/select';
import { Avatar, Button, Card, Empty, Screen, Section, T } from '@/ui/components';
import { CheckinRow, StrikeDots, StrikeRow } from '@/ui/parts';
import { colors, space } from '@/ui/theme';

export default function GroupTab() {
  const { snap, me, today, blocked, notify } = useGroup();
  const g = snap.group;
  const openStrikes = snap.strikes.filter((s) => s.outcome === 'pending').sort((a, b) => b.date.localeCompare(a.date));
  const feed = snap.checkins
    .filter((c) => !blocked.includes(c.ownerId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 20);

  const invite = async () => {
    if ((await shareInvite(g)) === 'copied') notify('Invite copied. Paste it into your group chat.');
  };

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <View style={{ flex: 1 }}>
          <T v="title" accessibilityRole="header">{g.name}</T>
          <T v="small" color={colors.muted}>{snap.members.length} of 8 members · invite code {g.inviteCode}</T>
        </View>
        <Button small kind="ghost" icon="create-outline" label="Edit" onPress={() => router.push('/edit-group')} />
      </View>

      <Card tone="amber">
        <T v="small" color="#92400E">The forfeit</T>
        <T v="heading">{g.forfeit || 'No forfeit set yet. Agree on one and add it with Edit.'}</T>
        <T v="small" color={colors.muted}>The app keeps score. You settle it between yourselves.</T>
      </Card>

      <Section title="Members" action={snap.members.length < 8 ? <Button small kind="soft" icon="person-add-outline" label="Invite" onPress={invite} /> : undefined}>
        <Card>
          {snap.members.map((m) => {
            const day = memberDay(m.id, today, snap.tasks, snap.checkins);
            const isMe = m.id === me.id;
            return (
              <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 56 }}>
                <Avatar name={m.displayName} color={m.avatarColor} />
                <View style={{ flex: 1, gap: 3 }}>
                  <T v="label">{m.displayName}{isMe ? ' (you)' : ''}</T>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                    <StrikeDots count={strikeCount(snap, m.id, today)} />
                    <T v="small" color={day.status === 'complete' ? colors.green : colors.muted} numberOfLines={1}>
                      {day.status === 'rest' ? 'Rest day' : day.status === 'complete' ? 'Done today' : `${day.done.length} of ${day.due.length} today`}
                    </T>
                  </View>
                </View>
                {!isMe && !blocked.includes(m.id) && (
                  <Button small kind="ghost" icon="add" label="Task" onPress={() => router.push({ pathname: '/task/new', params: { ownerId: m.id } })} />
                )}
              </View>
            );
          })}
        </Card>
        {snap.members.length < 3 && (
          <T v="small" color={colors.muted}>A group works best with 3 to 8 people. Invite {3 - snap.members.length} more to get started properly.</T>
        )}
      </Section>

      {openStrikes.length > 0 && (
        <Section title="Open strikes">
          {openStrikes.map((s) => <StrikeRow key={s.id} snap={snap} strike={s} meId={me.id} today={today} />)}
        </Section>
      )}

      <Section title="Proof feed">
        {feed.length === 0 ? (
          <Card>
            <Empty icon="images-outline" title="No proof yet" body="Check-ins from everyone in the group appear here, newest first." />
          </Card>
        ) : (
          feed.map((c) => <CheckinRow key={c.id} snap={snap} checkin={c} today={today} />)
        )}
      </Section>
    </Screen>
  );
}
