import { router } from 'expo-router';
import { useState } from 'react';

import { useGroup } from '@/state/app';
import { Button, Card, Field, Header, Screen } from '@/ui/components';

export default function EditGroup() {
  const { backend, snap, run } = useGroup();
  const [name, setName] = useState(snap.group.name);
  const [forfeit, setForfeit] = useState(snap.group.forfeit);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const ok = await run(() => backend.updateGroup(snap.group.id, name, forfeit), 'Group updated');
    setBusy(false);
    if (ok) router.back();
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Edit group" />
      <Card>
        <Field label="Group name" value={name} onChangeText={setName} maxLength={40} error={!name.trim() ? 'Give your group a name' : undefined} />
        <Field label="The forfeit" value={forfeit} onChangeText={setForfeit} maxLength={140} placeholder="e.g. Most strikes buys the coffee" hint="Everyone in the group can see and change this." />
        <Button label="Save" onPress={save} loading={busy} />
      </Card>
    </Screen>
  );
}
