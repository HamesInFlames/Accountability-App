import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { RULES, statementDeadline, strikesInCycle, tally, voteDeadline } from '@domain';

import { useGroup } from '@/state/app';
import { hoursLeft, member, prettyDate } from '@/state/select';
import { Avatar, Button, Card, Empty, Field, Header, Pill, Screen, T } from '@/ui/components';
import { StrikeDots } from '@/ui/parts';
import { colors, space } from '@/ui/theme';

/** A strike: the member's statement and the group's vote to excuse or uphold it. */
export default function StrikeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { backend, snap, me, today, run } = useGroup();
  const [text, setText] = useState('');
  const strike = snap.strikes.find((s) => s.id === id);
  if (!strike) {
    return (
      <Screen>
        <Header title="Strike" />
        <Empty icon="alert-circle-outline" title="Strike not found" body="It may have been settled a while ago." />
      </Screen>
    );
  }
  const who = member(snap, strike.userId);
  const mine = strike.userId === me.id;
  const pending = strike.outcome === 'pending';
  const t = tally(strike, snap.votes, snap.members.map((m) => m.id));
  const myVote = snap.votes.find((v) => v.strikeId === strike.id && v.voterId === me.id)?.choice;
  const used = strikesInCycle(snap.strikes, strike.userId, strike.date).length;
  const now = backend.now();
  const deadline = strike.statementAt ? voteDeadline(strike)! : statementDeadline(strike);

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Strike" />
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <Avatar name={who.displayName} color={who.avatarColor} size={48} />
          <View style={{ flex: 1, gap: 4 }}>
            <T v="heading">{mine ? 'You' : who.displayName} missed {prettyDate(strike.date, today)}</T>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <StrikeDots count={used} />
              <T v="small" color={colors.muted}>{used} of {RULES.strikesPerCycle} this week</T>
            </View>
          </View>
        </View>
        {strike.outcome === 'excused' && <Pill tone="green" icon="checkmark-circle" label="Excused by the group. The strike was removed." />}
        {strike.outcome === 'upheld' && <Pill tone="red" icon="close-circle" label="Upheld. The strike stands." />}
        {pending && <Pill tone="amber" icon="time" label={`${strike.statementAt ? 'Voting' : 'Statement due'}: ${hoursLeft(deadline, now)}`} />}
        <T v="small" color={colors.muted}>
          The streak survives a first and second strike. It breaks if a third strike in the same week is upheld.
        </T>
      </Card>

      {strike.statement ? (
        <Card>
          <T v="small" color={colors.muted}>{mine ? 'Your statement' : `${who.displayName}'s statement`}</T>
          <T>{strike.statement}</T>
        </Card>
      ) : mine && pending ? (
        <Card tone="amber">
          <Field
            label="Tell your group why you missed"
            value={text}
            onChangeText={setText}
            multiline
            maxLength={500}
            placeholder="Be honest. They vote on whether to excuse it."
            hint="Only your group can read this. Without a statement the strike stands after 24 hours."
            testID="statement"
          />
          <Button label="Post statement" disabled={!text.trim()} onPress={() => run(() => backend.postStatement(strike.id, text), 'Statement posted. Your group is voting.')} testID="post-statement" />
        </Card>
      ) : (
        <Card>
          <T color={colors.muted}>{pending ? `${who.displayName} has not posted a statement yet. Voting opens when they do.` : 'No statement was posted.'}</T>
        </Card>
      )}

      {strike.statementAt && (
        <Card>
          <T v="label">The vote</T>
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <Count n={t.excuse} label="Excuse" color={colors.green} />
            <Count n={t.uphold} label="Uphold" color={colors.red} />
            <Count n={t.eligible - t.excuse - t.uphold} label="Not voted" color={colors.muted} />
          </View>
          {pending && !mine && (
            <>
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <Button kind={myVote === 'excuse' ? 'success' : 'ghost'} icon="heart-outline" label="Excuse" style={{ flex: 1 }} onPress={() => run(() => backend.castVote(strike.id, 'excuse'), 'Vote counted')} testID="vote-excuse" />
                <Button kind={myVote === 'uphold' ? 'danger' : 'ghost'} icon="close" label="Uphold" style={{ flex: 1 }} onPress={() => run(() => backend.castVote(strike.id, 'uphold'), 'Vote counted')} testID="vote-uphold" />
              </View>
              {myVote && <T v="small" color={colors.muted}>You voted to {myVote}. You can change it until the vote closes.</T>}
            </>
          )}
          <T v="small" color={colors.muted}>
            A majority settles it straight away. If the vote closes without one, a tie or silence goes in {mine ? 'your' : 'their'} favour.
          </T>
        </Card>
      )}
    </Screen>
  );
}

function Count({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }} accessible accessibilityLabel={`${label}: ${n}`}>
      <T v="title" color={color}>{n}</T>
      <T v="small" color={colors.muted}>{label}</T>
    </View>
  );
}
