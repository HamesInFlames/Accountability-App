import { View } from 'react-native';

import { useGroup } from '@/state/app';
import { member } from '@/state/select';
import { Avatar, Button, Card, Empty, Header, Screen, T } from '@/ui/components';
import { colors, space } from '@/ui/theme';

export default function Blocked() {
  const { backend, snap, blocked, run } = useGroup();
  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Blocked people" />
      <T color={colors.muted}>You do not see check-ins or comments from people you block, and they cannot set tasks for you. They are not told.</T>
      {blocked.length === 0 ? (
        <Card><Empty icon="hand-left-outline" title="Nobody is blocked" body="To block someone, open one of their check-ins and choose Block." /></Card>
      ) : (
        <Card>
          {blocked.map((id) => {
            const m = member(snap, id);
            return (
              <View key={id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48 }}>
                <Avatar name={m.displayName} color={m.avatarColor} />
                <T v="label" style={{ flex: 1 }}>{m.displayName}</T>
                <Button small kind="ghost" label="Unblock" onPress={() => run(() => backend.unblock(id), `${m.displayName} is unblocked`)} />
              </View>
            );
          })}
        </Card>
      )}
    </Screen>
  );
}
