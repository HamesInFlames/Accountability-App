import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { addDays, cycleStart, recap, type Checkin } from '@domain';

import { useGroup } from '@/state/app';
import { member, prettyDate } from '@/state/select';
import { Avatar, Button, Card, Empty, Header, Photo, Screen, Section, T } from '@/ui/components';
import { usePhoto } from '@/ui/parts';
import { colors, space } from '@/ui/theme';

/** The weekly finish line: what the group did Monday to Sunday, and who owes the forfeit. */
export default function Recap() {
  const { snap, me, today, blocked } = useGroup();
  const [offset, setOffset] = useState(0);
  const anchor = addDays(today, -7 * offset);
  const current = offset === 0;
  const r = recap(snap, anchor, current ? today : undefined);
  const total = r.rows.reduce((n, row) => n + row.checkins, 0);
  const names = r.owesForfeit.map((id) => (id === me.id ? 'You' : member(snap, id).displayName));
  const daysLeft = 6 - Math.round((Date.parse(today) - Date.parse(cycleStart(today))) / 86_400_000);
  const photos = r.photos.filter((p) => !blocked.includes(p.ownerId));

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Weekly recap" />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Button small kind="ghost" icon="chevron-back" label="Earlier" onPress={() => setOffset(offset + 1)} disabled={offset >= 8} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <T v="label">{prettyDate(r.start)} to {prettyDate(r.end)}</T>
          <T v="small" color={colors.muted}>{current ? (daysLeft === 0 ? 'Finish line is today' : `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} to the finish line`) : 'Finished'}</T>
        </View>
        <Button small kind="ghost" label="Later" onPress={() => setOffset(offset - 1)} disabled={current} />
      </View>

      <Card tone="amber">
        <View style={{ flexDirection: 'row' }}>
          <Stat n={current ? snap.group.currentStreak : snap.group.bestStreak} label={current ? 'day streak' : 'best streak'} />
          <Stat n={total} label="check-ins" />
          <Stat n={r.rows.reduce((n, row) => n + row.strikes, 0)} label="strikes" />
        </View>
      </Card>

      <Section title="Everyone's week">
        <Card>
          {r.rows.map((row) => {
            const m = member(snap, row.userId);
            return (
              <View key={row.userId} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48 }}>
                <Avatar name={m.displayName} color={m.avatarColor} />
                <View style={{ flex: 1 }}>
                  <T v="label">{row.userId === me.id ? 'You' : m.displayName}</T>
                  <T v="small" color={colors.muted}>{row.daysComplete} full {row.daysComplete === 1 ? 'day' : 'days'} · {row.checkins} check-ins</T>
                </View>
                <T v="label" color={row.strikes > 0 ? colors.red : colors.green}>{row.strikes} {row.strikes === 1 ? 'strike' : 'strikes'}</T>
              </View>
            );
          })}
        </Card>
      </Section>

      <Card>
        <T v="small" color={colors.muted}>The forfeit</T>
        <T v="heading">{snap.group.forfeit || 'No forfeit set'}</T>
        <T color={names.length ? colors.red : colors.green}>
          {names.length === 0
            ? `Nobody has a strike${current ? ' so far' : ''}. Nobody owes it.`
            : `${names.join(' and ')} ${names.length === 1 && names[0] !== 'You' ? 'has' : 'have'} the most strikes${current ? ' so far' : ''}.`}
        </T>
      </Card>

      <Section title="Proof from the week">
        {photos.length === 0 ? (
          <Card><Empty icon="images-outline" title="No photos this week" body="Check-ins made this week will be collected here." /></Card>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {photos.map((p) => <Tile key={p.id} checkin={p} label={member(snap, p.ownerId).displayName} />)}
          </View>
        )}
      </Section>
    </Screen>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }} accessible accessibilityLabel={`${n} ${label}`}>
      <T v="display">{n}</T>
      <T v="small" color="#92400E">{label}</T>
    </View>
  );
}

function Tile({ checkin, label }: { checkin: Checkin; label: string }) {
  const uri = usePhoto(checkin.photoPath);
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/proof/[id]', params: { id: checkin.id } })}
      accessibilityRole="button"
      accessibilityLabel={`Proof from ${label}, ${prettyDate(checkin.date)}`}
      style={{ width: '31.5%' }}>
      <Photo uri={uri} seed={checkin.id} label="" style={{ aspectRatio: 1 }} />
    </Pressable>
  );
}
