// Design decisions (made up front, per the build ritual): a habit-tracker palette of streak amber
// and progress green on warm paper, with rounded, friendly type. This is the app's own brand.
export const colors = {
  bg: '#FFFBEB',
  card: '#FFFFFF',
  sunken: '#FCF6F0',
  border: '#F3E3CF',
  text: '#0F172A',
  muted: '#475569',
  faint: '#94A3B8',
  amber: '#D97706',
  amberBright: '#F59E0B',
  amberSoft: '#FEF3C7',
  onAmber: '#1F1300',
  green: '#047857',
  greenSoft: '#D1FAE5',
  red: '#B91C1C',
  redSoft: '#FEE2E2',
  blue: '#1D4ED8',
  blueSoft: '#DBEAFE',
  white: '#FFFFFF',
  scrim: 'rgba(15, 23, 42, 0.55)',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 10, md: 16, lg: 22, pill: 999 } as const;

export const font = {
  regular: 'Nunito_500Medium',
  semi: 'Nunito_700Bold',
  bold: 'Nunito_800ExtraBold',
  black: 'Nunito_900Black',
} as const;

export const shadow = {
  shadowColor: '#92400E',
  shadowOpacity: 0.08,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
} as const;

/** Stable avatar colours, all dark enough for white initials (4.5:1 or better). */
export const avatarColors = ['#B45309', '#047857', '#1D4ED8', '#7C3AED', '#BE185D', '#0F766E', '#B91C1C', '#4338CA'];

export const MIN_TOUCH = 48;
