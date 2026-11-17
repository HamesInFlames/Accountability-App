import { Linking, View } from 'react-native';

import { SUPPORT_EMAIL } from '@/lib/config';
import { Button, Card, Header, Screen, T } from '@/ui/components';
import { colors, space } from '@/ui/theme';

const RULES = [
  ['Only post your own proof', 'Photos must be taken by you, in the app, of the task you are checking in for.'],
  ['Keep it clean', 'No nudity, violence, hate, harassment or anything illegal. This applies to photos, explanations, comments and statements.'],
  ['Respect the people in the photo', 'Do not photograph anyone who has not agreed to it, and never share a friend\'s proof outside the group.'],
  ['Be fair when you vote', 'Votes on a statement are for deciding whether a miss was reasonable, not for settling scores.'],
];

const PRIVACY = [
  'Your proof photos, explanations, comments and statements are visible only to the current members of your group.',
  'Photos are stored privately and are never publicly reachable.',
  'You can leave a group at any time without notifying anyone.',
  'You can delete your account and everything in it from Settings.',
  'This app is for people aged 13 and over.',
];

export default function Rules() {
  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Content rules and privacy" />
      <Card>
        <T v="heading" accessibilityRole="header">Content rules</T>
        {RULES.map(([title, body]) => (
          <View key={title} style={{ gap: 2 }}>
            <T v="label">{title}</T>
            <T color={colors.muted}>{body}</T>
          </View>
        ))}
      </Card>
      <Card>
        <T v="heading" accessibilityRole="header">Report and block</T>
        <T color={colors.muted}>
          Open any check-in and use Report to flag it, or Block to hide that person's posts from you and stop them setting you tasks. Reports are reviewed within 24 hours, and accounts that break these rules are removed.
        </T>
      </Card>
      <Card>
        <T v="heading" accessibilityRole="header">Privacy, in short</T>
        {PRIVACY.map((line) => (
          <View key={line} style={{ flexDirection: 'row', gap: space.sm }}>
            <T color={colors.amber}>•</T>
            <T color={colors.muted} style={{ flex: 1 }}>{line}</T>
          </View>
        ))}
      </Card>
      <Button kind="ghost" icon="mail-outline" label={`Contact ${SUPPORT_EMAIL}`} onPress={() => void Linking.openURL(`mailto:${SUPPORT_EMAIL}`)} />
    </Screen>
  );
}
