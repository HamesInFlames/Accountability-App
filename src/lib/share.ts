import * as Clipboard from 'expo-clipboard';
import { Platform, Share } from 'react-native';
import type { Group } from '@domain';

import { INVITE_URL_BASE } from './config';

export const inviteMessage = (g: Group) =>
  `Join my accountability group "${g.name}". Open the app and enter invite code ${g.inviteCode}, or tap ${INVITE_URL_BASE}${g.inviteCode}`;

/** Share the invite through the system sheet, falling back to the clipboard. Returns what happened. */
export async function shareInvite(g: Group): Promise<'shared' | 'copied'> {
  if (Platform.OS !== 'web') {
    try {
      await Share.share({ message: inviteMessage(g) });
      return 'shared';
    } catch {
      // fall through to clipboard
    }
  }
  await Clipboard.setStringAsync(inviteMessage(g));
  return 'copied';
}
