import { Ionicons } from '@expo/vector-icons';
import type { ColorValue } from 'react-native';
import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';

import { useApp } from '@/state/app';
import { myOpenStrikes, pendingForMe, reviewQueue, votesNeeded } from '@/state/select';
import type { IconName } from '@/ui/components';
import { colors, font } from '@/ui/theme';

const icon = (name: IconName, active: IconName) =>
  function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    return <Ionicons name={focused ? active : name} size={24} color={typeof color === 'string' ? color : colors.muted} />;
  };

export default function TabsLayout() {
  const { me, groups, snap, today, blocked } = useApp();
  if (!me) return <Redirect href="/welcome" />;
  if (groups.length === 0) return <Redirect href="/start" />;
  if (!snap) return null;

  const homeBadge = reviewQueue(snap, me.id, today, blocked).length + myOpenStrikes(snap, me.id).length + votesNeeded(snap, me.id).length;
  const taskBadge = pendingForMe(snap, me.id).length;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#92400E',
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontFamily: font.semi, fontSize: 11.5 },
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border, minHeight: 62, paddingTop: 6 },
        tabBarBadgeStyle: { backgroundColor: colors.red, color: colors.white, fontFamily: font.semi, fontSize: 11 },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon('home-outline', 'home'), tabBarBadge: homeBadge || undefined }} />
      <Tabs.Screen name="group" options={{ title: 'Group', tabBarIcon: icon('people-outline', 'people') }} />
      <Tabs.Screen name="calendar" options={{ title: 'Calendar', tabBarIcon: icon('calendar-outline', 'calendar') }} />
      <Tabs.Screen name="tasks" options={{ title: 'My Tasks', tabBarIcon: icon('checkbox-outline', 'checkbox'), tabBarBadge: taskBadge || undefined }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: icon('settings-outline', 'settings') }} />
    </Tabs>
  );
}
