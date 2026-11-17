import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, font, MIN_TOUCH, radius, shadow, space } from './theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

type Variant = 'display' | 'title' | 'heading' | 'body' | 'label' | 'small';
const textStyles: Record<Variant, object> = {
  display: { fontFamily: font.black, fontSize: 34, lineHeight: 40 },
  title: { fontFamily: font.black, fontSize: 26, lineHeight: 32 },
  heading: { fontFamily: font.bold, fontSize: 18, lineHeight: 24 },
  body: { fontFamily: font.regular, fontSize: 16, lineHeight: 23 },
  label: { fontFamily: font.semi, fontSize: 15, lineHeight: 20 },
  small: { fontFamily: font.regular, fontSize: 13, lineHeight: 18 },
};

export function T({
  v = 'body',
  color = colors.text,
  center,
  style,
  ...rest
}: TextProps & { v?: Variant; color?: string; center?: boolean }) {
  return <Text {...rest} style={[textStyles[v], { color }, center && { textAlign: 'center' }, style]} />;
}

export function Screen({
  children,
  scroll = true,
  edges = ['top'],
  pad = true,
}: {
  children: ReactNode;
  scroll?: boolean;
  edges?: ('top' | 'bottom')[];
  pad?: boolean;
}) {
  const inner = pad ? styles.pad : undefined;
  return (
    <SafeAreaView style={styles.screen} edges={edges}>
      {scroll ? (
        <ScrollView contentContainerStyle={[inner, styles.scroll]} keyboardShouldPersistTaps="handled">
          <View style={styles.column}>{children}</View>
        </ScrollView>
      ) : (
        <View style={[inner, styles.column, { flex: 1 }]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

/** Header for pushed screens: back button and title. */
export function Header({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <View style={styles.header}>
      <Pressable
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={8}
        style={styles.back}>
        <Ionicons name="chevron-back" size={24} color={colors.text} />
      </Pressable>
      <T v="heading" style={{ flex: 1 }} numberOfLines={1} accessibilityRole="header">
        {title}
      </T>
      {right}
    </View>
  );
}

export function Card({ children, style, tone }: { children: ReactNode; style?: StyleProp<ViewStyle>; tone?: 'amber' | 'green' | 'red' | 'blue' }) {
  const bg = tone === 'amber' ? colors.amberSoft : tone === 'green' ? colors.greenSoft : tone === 'red' ? colors.redSoft : tone === 'blue' ? colors.blueSoft : colors.card;
  return <View style={[styles.card, { backgroundColor: bg }, !tone && shadow, style]}>{children}</View>;
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <View style={{ gap: space.sm }}>
      <View style={styles.sectionHead}>
        <T v="heading" accessibilityRole="header">
          {title}
        </T>
        {action}
      </View>
      {children}
    </View>
  );
}

type ButtonKind = 'primary' | 'success' | 'ghost' | 'danger' | 'soft';
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Button({
  label,
  onPress,
  kind = 'primary',
  icon,
  loading,
  disabled,
  small,
  style,
  testID,
}: {
  label: string;
  onPress?: () => void;
  kind?: ButtonKind;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const palette: Record<ButtonKind, { bg: string; fg: string; border?: string }> = {
    primary: { bg: colors.amberBright, fg: colors.onAmber },
    success: { bg: colors.green, fg: colors.white },
    ghost: { bg: 'transparent', fg: colors.text, border: colors.border },
    danger: { bg: colors.red, fg: colors.white },
    soft: { bg: colors.amberSoft, fg: colors.onAmber },
  };
  const p = palette[kind];
  const off = disabled || loading;
  return (
    <AnimatedPressable
      testID={testID}
      onPress={off ? undefined : onPress}
      disabled={!!off}
      onPressIn={() => (scale.value = withSpring(0.96, { damping: 18, stiffness: 320 }))}
      onPressOut={() => (scale.value = withSpring(1, { damping: 14, stiffness: 260 }))}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      style={[
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: p.bg, borderColor: p.border ?? p.bg, opacity: off ? 0.5 : 1 },
        anim,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={p.fg} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={small ? 16 : 20} color={p.fg} />}
          <T v="label" color={p.fg} style={small ? { fontSize: 14 } : { fontSize: 16 }}>
            {label}
          </T>
        </>
      )}
    </AnimatedPressable>
  );
}

export function Field({ label, hint, error, ...input }: TextInputProps & { label: string; hint?: string; error?: string }) {
  return (
    <View style={{ gap: space.xs }}>
      <T v="label">{label}</T>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.faint}
        {...input}
        style={[styles.input, input.multiline && styles.inputMulti, !!error && { borderColor: colors.red }, input.style]}
      />
      {error ? (
        <T v="small" color={colors.red}>
          {error}
        </T>
      ) : hint ? (
        <T v="small" color={colors.muted}>
          {hint}
        </T>
      ) : null}
    </View>
  );
}

export function Avatar({ name, color, size = 40 }: { name: string; color: string; size?: number }) {
  return (
    <View
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}
      accessibilityElementsHidden
      importantForAccessibility="no">
      <Text style={{ fontFamily: font.bold, fontSize: size * 0.42, color: colors.white }}>
        {name.trim().charAt(0).toUpperCase() || '?'}
      </Text>
    </View>
  );
}

type Tone = 'amber' | 'green' | 'red' | 'grey' | 'blue';
const tones: Record<Tone, { bg: string; fg: string }> = {
  amber: { bg: colors.amberSoft, fg: '#92400E' },
  green: { bg: colors.greenSoft, fg: '#065F46' },
  red: { bg: colors.redSoft, fg: '#991B1B' },
  blue: { bg: colors.blueSoft, fg: '#1E40AF' },
  grey: { bg: colors.sunken, fg: colors.muted },
};

export function Pill({ label, tone = 'grey', icon }: { label: string; tone?: Tone; icon?: IconName }) {
  const t = tones[tone];
  return (
    <View style={[styles.pill, { backgroundColor: t.bg }]}>
      {icon && <Ionicons name={icon} size={13} color={t.fg} />}
      <Text style={{ fontFamily: font.semi, fontSize: 12.5, color: t.fg }}>{label}</Text>
    </View>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={[styles.chip, selected && { backgroundColor: colors.amberBright, borderColor: colors.amberBright }]}>
      <T v="label" color={selected ? colors.onAmber : colors.text}>
        {label}
      </T>
    </Pressable>
  );
}

export function Row({ children, onPress, label }: { children: ReactNode; onPress?: () => void; label?: string }) {
  if (!onPress) return <View style={styles.row}>{children}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
      {children}
    </Pressable>
  );
}

export function Empty({ icon, title, body, action }: { icon: IconName; title: string; body: string; action?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={28} color={colors.amber} />
      </View>
      <T v="heading" center>
        {title}
      </T>
      <T color={colors.muted} center>
        {body}
      </T>
      {action}
    </View>
  );
}

/** Proof photo. Demo friends have no real photos, so they get a drawn placeholder. */
export function Photo({ uri, seed, style, label }: { uri: string | null; seed: string; style?: StyleProp<ViewStyle>; label: string }) {
  if (uri) {
    return (
      <View style={[styles.photo, style]}>
        <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" alt={label} accessible={!!label} transition={150} />
      </View>
    );
  }
  const hues = ['#FDE68A', '#A7F3D0', '#BFDBFE', '#FBCFE8', '#DDD6FE'];
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <View
      style={[styles.photo, { backgroundColor: hues[h % hues.length], alignItems: 'center', justifyContent: 'center' }, style]}
      {...(label ? { accessibilityLabel: label, accessibilityRole: 'image' as const } : { 'aria-hidden': true, importantForAccessibility: 'no' as const })}>
      <Ionicons name="image-outline" size={36} color={colors.muted} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  pad: { paddingHorizontal: space.lg },
  scroll: { paddingBottom: 120, paddingTop: space.md },
  column: { gap: space.lg, width: '100%', maxWidth: 560, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: MIN_TOUCH },
  back: { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center', marginLeft: -space.md },
  card: { borderRadius: radius.lg, padding: space.lg, gap: space.md },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 32 },
  button: {
    minHeight: 52,
    borderRadius: radius.pill,
    paddingHorizontal: space.xl,
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  buttonSmall: { minHeight: MIN_TOUCH, paddingHorizontal: space.lg },
  input: {
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    fontFamily: font.regular,
    fontSize: 16,
    color: colors.text,
  },
  inputMulti: { minHeight: 110, textAlignVertical: 'top' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, alignSelf: 'flex-start' },
  chip: {
    minHeight: MIN_TOUCH,
    minWidth: MIN_TOUCH,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: MIN_TOUCH },
  empty: { alignItems: 'center', gap: space.sm, paddingVertical: space.xl, paddingHorizontal: space.lg },
  emptyIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.amberSoft, alignItems: 'center', justifyContent: 'center' },
  photo: { borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.sunken, aspectRatio: 4 / 3 },
});
