import { Nunito_500Medium, Nunito_700Bold, Nunito_800ExtraBold, Nunito_900Black, useFonts } from '@expo-google-fonts/nunito';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppProvider, useApp } from '@/state/app';
import { T } from '@/ui/components';
import { colors, radius, shadow, space } from '@/ui/theme';

void SplashScreen.preventAutoHideAsync();

export const unstable_settings = { anchor: '(tabs)' };

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Nunito_500Medium, Nunito_700Bold, Nunito_800ExtraBold, Nunito_900Black });
  return (
    <SafeAreaProvider>
      <AppProvider>
        <Nav fontsReady={fontsLoaded || !!fontError} />
      </AppProvider>
    </SafeAreaProvider>
  );
}

function Nav({ fontsReady }: { fontsReady: boolean }) {
  const { ready, me } = useApp();
  const up = ready && fontsReady;
  useEffect(() => {
    if (up) void SplashScreen.hideAsync();
  }, [up]);
  if (!up) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  const signedIn = !!me;
  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        {/* (tabs) and welcome redirect to each other themselves; everything else needs a signed-in member. */}
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="welcome" />
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="start" />
          <Stack.Screen name="first-task" />
          <Stack.Screen name="checkin/[taskId]" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="proof/[id]" />
          <Stack.Screen name="task/new" options={{ presentation: 'modal' }} />
          <Stack.Screen name="strike/[id]" />
          <Stack.Screen name="recap" />
          <Stack.Screen name="blocked" />
          <Stack.Screen name="edit-group" options={{ presentation: 'modal' }} />
        </Stack.Protected>
        <Stack.Screen name="rules" />
        <Stack.Screen name="join/[code]" />
      </Stack>
      <ToastView />
    </>
  );
}

function ToastView() {
  const { toast } = useApp();
  const insets = useSafeAreaInsets();
  if (!toast) return null;
  const error = toast.kind === 'error';
  return (
    <View pointerEvents="none" style={[styles.toastWrap, { top: insets.top + space.sm }]}>
      <Animated.View
        key={toast.id}
        entering={FadeInUp.springify().damping(16)}
        exiting={FadeOutUp}
        accessibilityRole="alert"
        accessibilityLiveRegion="assertive"
        style={[styles.toast, { backgroundColor: error ? colors.red : colors.text }]}>
        <Ionicons name={error ? 'alert-circle' : 'checkmark-circle'} size={20} color={colors.white} />
        <T v="label" color={colors.white} style={{ flexShrink: 1 }}>
          {toast.text}
        </T>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  toastWrap: { position: 'absolute', left: space.lg, right: space.lg, alignItems: 'center', zIndex: 100 },
  toast: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.md, paddingHorizontal: space.lg, borderRadius: radius.md, maxWidth: 520, ...shadow },
});
