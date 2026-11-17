// Placeholders to replace before store submission (see docs/HANDOFF.md, "Before launch").
export const APP_NAME = 'Accountability';
export const SUPPORT_EMAIL = 'support@example.com';
export const INVITE_URL_BASE = 'accountability://join/';

let pendingInvite: string | null = null;
/** An invite code opened from a link before the person has signed up. */
export const invite = {
  set: (code: string | null) => (pendingInvite = code),
  take: () => {
    const c = pendingInvite;
    pendingInvite = null;
    return c;
  },
  peek: () => pendingInvite,
};
