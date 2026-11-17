import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, type CameraType } from 'expo-camera';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { inWindow, RULES } from '@domain';

import { useGroup } from '@/state/app';
import { Button, Field, T } from '@/ui/components';
import { colors, MIN_TOUCH, radius, space } from '@/ui/theme';

/**
 * Photo check-in. The photo can only come from the live camera: there is deliberately no
 * camera-roll picker, so an old photo cannot be reused as proof.
 */
export default function CheckinScreen() {
  const { taskId } = useLocalSearchParams<{ taskId: string }>();
  const { backend, snap, time, run } = useGroup();
  const task = snap.tasks.find((t) => t.id === taskId);
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [facing, setFacing] = useState<CameraType>('back');
  const [ready, setReady] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (!task) return <Notice title="Task not found" body="It may have been ended." onClose={close} />;
  if (!inWindow(time, task.windowStart, task.windowEnd)) {
    return <Notice title="The check-in window is closed" body={`You can check in for "${task.title}" between ${task.windowStart} and ${task.windowEnd}.`} onClose={close} />;
  }
  if (!permission) return <View style={styles.dark} />;
  if (!permission.granted) {
    return (
      <Notice
        title="Camera access is needed"
        body="Proof photos are taken live in the app, so the camera is the only way to check in."
        onClose={close}
        action={
          permission.canAskAgain
            ? <Button label="Allow camera" icon="camera" onPress={() => void requestPermission()} />
            : <Button label="Open phone settings" onPress={() => void Linking.openSettings()} />
        }
      />
    );
  }

  const shoot = async () => {
    if (!camera.current || !ready) return;
    const shot = await camera.current.takePictureAsync({ quality: 0.6, skipProcessing: false });
    if (shot?.uri) setPhoto(shot.uri);
  };

  const remaining = RULES.minExplanationChars - text.trim().length;
  const submit = async () => {
    setTried(true);
    if (!photo || remaining > 0) return;
    setBusy(true);
    const ok = await run(() => backend.submitCheckin(task.id, photo, text), 'Checked in. A friend will review it.');
    setBusy(false);
    if (ok) close();
  };

  if (!photo) {
    return (
      <View style={styles.dark}>
        <CameraView ref={camera} style={StyleSheet.absoluteFill} facing={facing} onCameraReady={() => setReady(true)} />
        <SafeAreaView style={styles.overlay} edges={['top', 'bottom']} pointerEvents="box-none">
          <View style={styles.topBar}>
            <Round icon="close" label="Cancel check-in" onPress={close} />
            <View style={styles.titleChip}>
              <T v="label" color={colors.white} numberOfLines={1}>{task.title}</T>
            </View>
            <Round icon="camera-reverse-outline" label="Switch camera" onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))} />
          </View>
          <View style={{ alignItems: 'center', gap: space.md, paddingBottom: space.lg }}>
            <T v="small" color={colors.white} center style={styles.hint}>Take the photo now. Old photos cannot be used.</T>
            <Pressable onPress={shoot} accessibilityRole="button" accessibilityLabel="Take photo" testID="shutter" style={({ pressed }) => [styles.shutter, pressed && { transform: [{ scale: 0.94 }] }, !ready && { opacity: 0.5 }]}>
              <View style={styles.shutterInner} />
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, maxWidth: 560, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
          <T v="title" accessibilityRole="header">{task.title}</T>
          <View style={{ borderRadius: radius.lg, overflow: 'hidden', aspectRatio: 4 / 3, backgroundColor: colors.sunken }}>
            <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel="Your proof photo" />
          </View>
          <Button small kind="ghost" icon="refresh" label="Retake photo" onPress={() => setPhoto(null)} />
          <Field
            label="What did you do, and how?"
            value={text}
            onChangeText={setText}
            multiline
            maxLength={500}
            placeholder="e.g. 5k along the lake in 31 minutes, then stretched."
            hint={remaining > 0 ? `${remaining} more ${remaining === 1 ? 'character' : 'characters'} needed` : 'Looks good.'}
            error={tried && remaining > 0 ? `Write at least ${RULES.minExplanationChars} characters so your friends know what happened` : undefined}
            testID="explanation"
          />
          <Button label="Send to my group" icon="send" onPress={submit} loading={busy} testID="submit-checkin" />
          <Button kind="ghost" label="Cancel" onPress={close} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Round({ icon, label, onPress }: { icon: 'close' | 'camera-reverse-outline'; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={styles.round}>
      <Ionicons name={icon} size={24} color={colors.white} />
    </Pressable>
  );
}

function Notice({ title, body, onClose, action }: { title: string; body: string; onClose: () => void; action?: React.ReactNode }) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: space.xl }}>
      <View style={{ gap: space.md, maxWidth: 480, alignSelf: 'center', width: '100%' }}>
        <T v="title" center accessibilityRole="header">{title}</T>
        <T color={colors.muted} center>{body}</T>
        {action}
        <Button kind="ghost" label="Back" onPress={onClose} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  dark: { flex: 1, backgroundColor: '#000' },
  overlay: { flex: 1, justifyContent: 'space-between' },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  titleChip: { flex: 1, alignItems: 'center', backgroundColor: colors.scrim, borderRadius: radius.pill, paddingVertical: space.sm, paddingHorizontal: space.lg },
  round: { width: MIN_TOUCH, height: MIN_TOUCH, borderRadius: MIN_TOUCH / 2, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center' },
  hint: { backgroundColor: colors.scrim, borderRadius: radius.pill, paddingVertical: 6, paddingHorizontal: space.md, overflow: 'hidden' },
  shutter: { width: 80, height: 80, borderRadius: 40, borderWidth: 5, borderColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.white },
});
