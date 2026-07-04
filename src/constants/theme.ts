import { Platform } from 'react-native';

const premiumLight = {
  background: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceMuted: '#F8FAFC',
  surfaceAlt: '#F8FAFC',
  border: '#E5E7EB',
  textPrimary: '#111827',
  textSecondary: '#6B7280',
  textTertiary: '#9CA3AF',
  primary: '#2563EB',
  primaryPressed: '#1D4ED8',
  success: '#16A34A',
  danger: '#DC2626',
  warning: '#F59E0B',
} as const;

const premiumDark = {
  background: '#0B1020',
  surface: '#111827',
  surfaceMuted: '#172033',
  surfaceAlt: '#141B2D',
  border: '#24314A',
  textPrimary: '#F5F7FA',
  textSecondary: '#C5CBD6',
  textTertiary: '#8B94A6',
  primary: '#60A5FA',
  primaryPressed: '#3B82F6',
  success: '#4ADE80',
  danger: '#F87171',
  warning: '#FBBF24',
} as const;

export const Colors = {
  light: {
    ...premiumLight,
    background: premiumLight.background,
    surface: premiumLight.surface,
    surfaceAlt: premiumLight.surfaceAlt,
    border: premiumLight.border,
    text: premiumLight.textPrimary,
    muted: premiumLight.textSecondary,
    primary: premiumLight.primary,
    primarySoft: '#EFF6FF',
    accentRed: premiumLight.danger,
    accentBlue: premiumLight.primary,
    success: premiumLight.success,
    warning: premiumLight.warning,
  },
  dark: {
    ...premiumDark,
    background: premiumDark.background,
    surface: premiumDark.surface,
    surfaceAlt: premiumDark.surfaceAlt,
    border: premiumDark.border,
    text: premiumDark.textPrimary,
    muted: premiumDark.textSecondary,
    primary: premiumDark.primary,
    primarySoft: '#1E293B',
    accentRed: premiumDark.danger,
    accentBlue: premiumDark.primary,
    success: premiumDark.success,
    warning: premiumDark.warning,
  },
} as const;

export type ThemeColor = keyof typeof Colors.light;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'System',
    mono: 'monospace',
  },
  web: {
    sans: 'system-ui',
    mono: 'ui-monospace',
  },
});

export const Spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
} as const;

export const Radius = {
  sm: 10,
  md: 16,
  lg: 22,
  xl: 30,
} as const;

export const SHADOW = {
  shadowColor: '#0F172A',
  shadowOpacity: 0.06,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 8 },
  elevation: 1,
} as const;
