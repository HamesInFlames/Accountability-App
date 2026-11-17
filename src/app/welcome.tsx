import { Ionicons } from '@expo/vector-icons';
import { Link, Redirect } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { APP_NAME } from '@/lib/config';
import { useApp } from '@/state/app';
import { Button, Card, Field, Screen, T } from '@/ui/components';
import { colors, space } from '@/ui/theme';

export default function Welcome() {
  const { backend, run, me } = useApp();
  const demo = backend.mode === 'demo';
  const [mode, setMode] = useState<'signup' | 'signin'>('signup');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);

  if (me) return <Redirect href="/" />;
  const signup = mode === 'signup';
  const errors = {
    name: signup && !name.trim() ? 'Tell your friends what to call you' : undefined,
    email: !demo && !/^\S+@\S+\.\S+$/.test(email.trim()) ? 'Enter a valid email address' : undefined,
    password: !demo && password.length < 8 ? 'Use at least 8 characters' : undefined,
  };
  const valid = !errors.name && !errors.email && !errors.password;

  const submit = async () => {
    setTried(true);
    if (!valid) return;
    setBusy(true);
    await run(() => (signup ? backend.signUp({ email, password, displayName: name }) : backend.signIn(email, password)));
    setBusy(false);
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ gap: space.xl }}>
        <View style={{ gap: space.sm, marginTop: space.xl }}>
          <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: colors.amberBright, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="flame" size={36} color={colors.onAmber} />
          </View>
          <T v="display" accessibilityRole="header">
            {APP_NAME}
          </T>
          <T v="body" color={colors.muted} style={{ fontSize: 18, lineHeight: 26 }}>
            You ignore your calendar. You do not ignore your friends. Set tasks for each other, prove them with a photo, keep one streak alive together.
          </T>
        </View>

        <Card>
          {signup && (
            <Field label="Your first name" value={name} onChangeText={setName} placeholder="e.g. James" autoCapitalize="words" autoComplete="given-name" maxLength={40} error={tried ? errors.name : undefined} testID="name" />
          )}
          {!demo && (
            <>
              <Field label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" autoComplete="email" error={tried ? errors.email : undefined} />
              <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete={signup ? 'new-password' : 'current-password'} hint={signup ? 'At least 8 characters' : undefined} error={tried ? errors.password : undefined} />
            </>
          )}
          <Button label={demo ? 'Start the demo' : signup ? 'Create account' : 'Sign in'} onPress={submit} loading={busy} testID="submit" />
          {!demo && (
            <Button kind="ghost" label={signup ? 'I already have an account' : 'Create a new account'} onPress={() => { setMode(signup ? 'signin' : 'signup'); setTried(false); }} />
          )}
        </Card>

        {demo && (
          <Card tone="blue">
            <T v="label">This is the demo</T>
            <T v="small" color={colors.text}>
              No server is connected, so three simulated friends play along and everything stays on this device. Add Supabase keys to go live.
            </T>
          </Card>
        )}

        <T v="small" color={colors.muted} center>
          For ages 13 and up. By continuing you agree to the{' '}
          <Link href="/rules" style={{ color: colors.blue, textDecorationLine: 'underline' }}>
            content rules and privacy summary
          </Link>
          .
        </T>
      </KeyboardAvoidingView>
    </Screen>
  );
}
