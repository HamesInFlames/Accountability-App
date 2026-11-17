import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { invite } from '@/lib/config';
import { useApp } from '@/state/app';

/** Invite links land here: accountability://join/ABC123. The code is kept through sign-up. */
export default function Join() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { me } = useApp();
  const [stored, setStored] = useState(false);
  useEffect(() => {
    invite.set((code ?? '').toUpperCase() || null);
    setStored(true);
  }, [code]);
  if (!stored) return null;
  return <Redirect href={me ? '/start' : '/welcome'} />;
}
