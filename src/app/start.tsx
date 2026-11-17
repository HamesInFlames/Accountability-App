import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { DEMO_INVITE_CODE } from '@/data';
import { invite } from '@/lib/config';
import { useApp } from '@/state/app';
import { Button, Card, Chip, Field, Header, Screen, T } from '@/ui/components';
import { colors, space } from '@/ui/theme';

/** Create or join a group. First stop after sign-up, and reachable later from Settings. */
export default function Start() {
  const { backend, run, groups, me, selectGroup } = useApp();
  const first = groups.length === 0;
  const [tab, setTab] = useState<'create' | 'join'>(invite.peek() ? 'join' : 'create');
  const [name, setName] = useState('');
  const [forfeit, setForfeit] = useState('');
  const [code, setCode] = useState(invite.peek() ?? '');
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);

  const create = async () => {
    setTried(true);
    if (!name.trim()) return;
    setBusy(true);
    let id = '';
    const ok = await run(async () => {
      id = (await backend.createGroup(name, forfeit)).id;
    });
    setBusy(false);
    if (ok) {
      selectGroup(id);
      router.replace('/first-task');
    }
  };

  const join = async () => {
    setTried(true);
    if (code.trim().length < 4) return;
    setBusy(true);
    let id = '';
    const ok = await run(async () => {
      id = (await backend.joinGroup(code)).id;
    });
    setBusy(false);
    if (ok) {
      invite.take();
      selectGroup(id);
      router.replace('/first-task');
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      {first ? (
        <View style={{ gap: space.xs, marginTop: space.lg }}>
          <T v="title" accessibilityRole="header">
            Hi {me?.displayName}. Who is keeping you honest?
          </T>
          <T color={colors.muted}>Groups are 3 to 8 people. Small enough that everyone notices a miss.</T>
        </View>
      ) : (
        <Header title="Add a group" />
      )}

      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Chip label="Start a group" selected={tab === 'create'} onPress={() => { setTab('create'); setTried(false); }} />
        <Chip label="I have an invite code" selected={tab === 'join'} onPress={() => { setTab('join'); setTried(false); }} />
      </View>

      {tab === 'create' ? (
        <Card>
          <Field label="Group name" value={name} onChangeText={setName} placeholder="e.g. The Library Crew" maxLength={40} error={tried && !name.trim() ? 'Give your group a name' : undefined} testID="group-name" />
          <Field
            label="The forfeit"
            value={forfeit}
            onChangeText={setForfeit}
            placeholder="e.g. Most strikes buys the coffee"
            maxLength={140}
            hint="Your group decides the stakes. The app records and announces it; you settle it between yourselves."
          />
          <Button label="Create group" onPress={create} loading={busy} testID="create-group" />
        </Card>
      ) : (
        <Card>
          <Field
            label="Invite code"
            value={code}
            onChangeText={(v) => setCode(v.toUpperCase())}
            placeholder="6 characters"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={8}
            error={tried && code.trim().length < 4 ? 'Enter the code your friend sent you' : undefined}
            hint={backend.mode === 'demo' ? `Demo: use ${DEMO_INVITE_CODE} to join a group that has been running for a week.` : undefined}
            testID="invite-code"
          />
          <Button label="Join group" onPress={join} loading={busy} testID="join-group" />
        </Card>
      )}
    </Screen>
  );
}
