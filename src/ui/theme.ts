/**
 * Aurora — system designu Scanocx.
 *
 * Jasna, przestrzenna baza + gradientowe akcenty violet→blue jako motyw „AI”.
 * Wszystkie ekrany czerpią wartości wyłącznie z tego pliku.
 */

export const palette = {
  canvas: '#F5F6FC',
  canvasDeep: '#EDEFF9',
  surface: '#FFFFFF',
  surfaceMuted: '#F4F5FB',
  surfaceSunken: '#EEF0F8',

  ink: '#0C0E1A',
  inkSoft: '#333A57',
  muted: '#6E7595',
  faint: '#A2A7C4',

  line: '#E6E8F4',
  lineStrong: '#D6DAEC',

  violet: '#6C4CF1',
  violetDeep: '#4B2FD1',
  violetSoft: '#EDE9FE',
  blue: '#4C7DF5',
  blueSoft: '#E6EEFE',
  mint: '#10BFA0',
  mintSoft: '#DDF7F1',
  amber: '#E9930C',
  amberSoft: '#FFF2D9',
  rose: '#E24B41',
  roseSoft: '#FDEAE8',

  night: '#07080E',
  nightSoft: '#12141F',
  white: '#FFFFFF',
} as const;

export const colors = {
  ...palette,

  bg: palette.canvas,
  text: palette.ink,
  textSoft: palette.inkSoft,
  border: palette.line,

  primary: palette.violet,
  primaryDeep: palette.violetDeep,
  primarySoft: palette.violetSoft,
  onPrimary: palette.white,

  success: palette.mint,
  successSoft: palette.mintSoft,
  warning: palette.amber,
  warningSoft: palette.amberSoft,
  danger: palette.rose,
  dangerSoft: palette.roseSoft,

  scrim: 'rgba(9, 11, 24, 0.52)',
  scrimSoft: 'rgba(9, 11, 24, 0.32)',
  glass: 'rgba(255, 255, 255, 0.86)',
  glassDark: 'rgba(10, 12, 20, 0.66)',
  hairline: 'rgba(12, 14, 26, 0.06)',
  pressTint: 'rgba(12, 14, 26, 0.05)',
} as const;

/** Gradienty jako tuple — expo-linear-gradient wymaga min. dwóch kolorów. */
export const gradients = {
  brand: ['#7C5CFF', '#4C7DF5'] as const,
  brandVivid: ['#8B5CFF', '#5A7DFF', '#22C3D6'] as const,
  aurora: ['#EFE9FF', '#E7F0FF', '#F5F6FC'] as const,
  auroraWarm: ['#FFE9F4', '#EDE9FF', '#F5F6FC'] as const,
  /** Hero Home — pastelowy sky blue → lavender jak na mockupu. */
  homeHero: ['#8EC8FB', '#B5B4F5', '#D4C4FC'] as const,
  mint: ['#14C9A6', '#2FA8E8'] as const,
  amber: ['#F7B733', '#EE7752'] as const,
  rose: ['#F3766B', '#E24B41'] as const,
  night: ['#1A1D2C', '#07080E'] as const,
  glassEdge: ['rgba(255,255,255,0.9)', 'rgba(255,255,255,0.6)'] as const,
  shade: ['rgba(7,8,14,0)', 'rgba(7,8,14,0.78)'] as const,
} as const;

/** Skala 4pt. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
} as const;

export const radius = {
  xs: 4,
  sm: 6,
  md: 10,
  lg: 12,
  xl: 14,
  xxl: 18,
  pill: 999,
} as const;

export const font = {
  display: { fontSize: 32, fontWeight: '800', letterSpacing: -1, color: colors.ink },
  h1: { fontSize: 25, fontWeight: '800', letterSpacing: -0.6, color: colors.ink },
  h2: { fontSize: 20, fontWeight: '700', letterSpacing: -0.4, color: colors.ink },
  h3: { fontSize: 17, fontWeight: '700', letterSpacing: -0.3, color: colors.ink },
  bodyStrong: { fontSize: 15, fontWeight: '600', letterSpacing: -0.2, color: colors.ink },
  body: { fontSize: 15, fontWeight: '400', lineHeight: 22, color: colors.inkSoft },
  small: { fontSize: 13, fontWeight: '500', lineHeight: 19, color: colors.muted },
  label: { fontSize: 13, fontWeight: '700', letterSpacing: -0.1, color: colors.ink },
  caption: { fontSize: 11, fontWeight: '700', letterSpacing: 0.7, color: colors.muted },
  numeric: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'], color: colors.ink },
} as const;

export const shadow = {
  /** Karty na płaskim tle. */
  soft: {
    shadowColor: '#141A3A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 2,
  },
  /** Wyróżnione karty i arkusze. */
  card: {
    shadowColor: '#141A3A',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.09,
    shadowRadius: 26,
    elevation: 6,
  },
  /** Pływające docki i FAB-y. */
  float: {
    shadowColor: '#1B1250',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.18,
    shadowRadius: 30,
    elevation: 14,
  },
} as const;

/** Wysokość pływającego dolnego paska (bez safe-area). */
export const BOTTOM_NAV_HEIGHT = 64;

export const layout = {
  screenPadding: space.xl,
  gutter: space.lg,
} as const;
