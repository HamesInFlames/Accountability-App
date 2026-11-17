import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Platform, Switch, View } from 'react-native';

import { confirm } from '@/lib/confirm';
import { SUPPORT_EMAIL } from '@/lib/config';
import { enableNotifications, notificationsAllowed } from '@/lib/notifications';
import { useGroup } from '@/state/app';
import { Button, Card, Chip, Field, Row, Screen, Section, T } from '@/ui/components';
import type { IconName } from '@/ui/components';
import { colors, space } from '@/ui/theme';

export default function SettingsTab() {
  const { backend, snap, me, groups, run, notify, selectGroup, blocked } = useGroup();
  const [name, setName] = useState(me.displayName);
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    void notificationsAllowed().then(setAllowed);
  }, []);

  const turnOn = async () => {
    const { granted, token } = await enableNotifications();
    setAllowed(granted);
    if (token) await run(() => backend.updateProfile({ pushToken: token }));
    notify(granted ? 'Reminders are on' : 'Notifications are blocked. Allow them in your phone settings.', granted ? 'ok' : 'error');
  };

  const leave = async () => {
    if (await confirm('Leave this group?', 'Nobody is notified. Your tasks end and your past check-ins stay with the group.', 'Leave', true)) {
      await run(() => backend.leaveGroup(snap.group.id), 'You left the group');
    }
  };

  const remove = async () => {
    if (await confirm('Delete your account?', 'This permanently deletes your profile, tasks, check-ins and photos. It cannot be undone.', 'Delete account', true)) {
      await run(() => backend.deleteAccount());
    }
  };

  return (
    <Screen>
      <T v="title" accessibilityRole="header">Settings</T>

      <Section title="Profile">
        <Card>
          <Field label="Name your friends see" value={name} onChangeText={setName} maxLength={40} />
          {name.trim() !== me.displayName && name.trim().length > 0 && (
            <Button small label="Save name" onPress={() => run(() => backend.updateProfile({ displayName: name }), 'Name saved')} />
          )}
          {me.email && <T v="small" color={colors.muted}>Signed in as {me.email}</T>}
          <T v="small" color={colors.muted}>Timezone: {me.timezone}. Your day ends at midnight here.</T>
        </Card>
      </Section>

      <Section title="Notifications">
        <Card>
          {Platform.OS === 'web' ? (
            <T color={colors.muted}>Reminders and nudges arrive on the phone app.</T>
          ) : allowed ? (
            <Line icon="notifications" title="Check-in reminders are on" body="When each window opens, and an hour before it closes. Change window times by ending a task and adding it again." />
          ) : (
            <Button icon="notifications-outline" label="Turn on reminders" onPress={turnOn} />
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48 }}>
            <T v="label" style={{ flex: 1 }}>Let friends nudge me</T>
            <Switch
              value={me.notifyNudges}
              onValueChange={(v) => void run(() => backend.updateProfile({ notifyNudges: v }))}
              accessibilityLabel="Let friends nudge me"
              trackColor={{ true: colors.green, false: colors.faint }}
            />
          </View>
        </Card>
      </Section>

      <Section title="Groups">
        <Card>
          {groups.length > 1 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {groups.map((g) => <Chip key={g.id} label={g.name} selected={g.id === snap.group.id} onPress={() => selectGroup(g.id)} />)}
            </View>
          )}
          <Link icon="add-circle-outline" label="Start or join another group" onPress={() => router.push('/start')} />
          <Link icon="exit-outline" label={`Leave ${snap.group.name}`} onPress={leave} danger />
        </Card>
      </Section>

      <Section title="Privacy and safety">
        <Card>
          <Link icon="hand-left-outline" label={`Blocked people (${blocked.length})`} onPress={() => router.push('/blocked')} />
          <Link icon="document-text-outline" label="Content rules and privacy" onPress={() => router.push('/rules')} />
          <Link icon="mail-outline" label="Report a problem" onPress={() => void Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=Problem%20report`)} />
        </Card>
      </Section>

      {backend.mode === 'demo' && (
        <Section title="Demo controls">
          <Card tone="blue">
            <T v="small">The demo runs on this device with simulated friends. End the day to see strikes, votes and the streak update.</T>
            <Button small kind="soft" icon="moon-outline" label="End today and start tomorrow" onPress={() => run(() => backend.demoAdvanceDay!(), 'A new day has started')} testID="advance-day" />
          </Card>
        </Section>
      )}

      <Section title="Account">
        <Card>
          <Link icon="log-out-outline" label={backend.mode === 'demo' ? 'Reset the demo' : 'Sign out'} onPress={() => run(() => backend.signOut())} />
          <Link icon="trash-outline" label="Delete my account" onPress={remove} danger />
        </Card>
      </Section>
    </Screen>
  );
}

function Link({ icon, label, onPress, danger }: { icon: IconName; label: string; onPress: () => void; danger?: boolean }) {
  const color = danger ? colors.red : colors.text;
  return (
    <Row onPress={onPress} label={label}>
      <Ionicons name={icon} size={22} color={color} />
      <T v="label" color={color} style={{ flex: 1 }}>{label}</T>
      <Ionicons name="chevron-forward" size={18} color={colors.faint} />
    </Row>
  );
}

function Line({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: space.md }}>
      <Ionicons name={icon} size={22} color={colors.green} />
      <View style={{ flex: 1 }}>
        <T v="label">{title}</T>
        <T v="small" color={colors.muted}>{body}</T>
      </View>
    </View>
  );
}
