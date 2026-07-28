import { StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import type { AiStatus, OcrStatus } from '@/src/domain/types';

import { Icon, type IconName } from './Icon';
import { colors, radius, space } from './theme';

export type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'dark' | 'glass';

const TONES: Record<BadgeTone, { bg: string; fg: string; border?: string }> = {
  neutral: { bg: colors.surfaceMuted, fg: colors.muted },
  primary: { bg: colors.primarySoft, fg: colors.primaryDeep },
  success: { bg: colors.successSoft, fg: '#0A8C77' },
  warning: { bg: colors.warningSoft, fg: '#A96A05' },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
  dark: { bg: colors.ink, fg: colors.white },
  glass: { bg: 'rgba(255,255,255,0.14)', fg: colors.white, border: 'rgba(255,255,255,0.22)' },
};

type Props = {
  label: string;
  tone?: BadgeTone;
  icon?: IconName;
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
};

export function Badge({ label, tone = 'neutral', icon, size = 'sm', style }: Props) {
  const t = TONES[tone];
  const small = size === 'sm';

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: t.bg,
          borderColor: t.border ?? 'transparent',
          borderWidth: t.border ? 1 : 0,
          paddingHorizontal: small ? space.sm + 2 : space.md,
          paddingVertical: small ? 5 : 8,
        },
        style,
      ]}>
      {icon ? <Icon name={icon} size={small ? 12 : 14} color={t.fg} /> : null}
      <Text
        numberOfLines={1}
        style={[styles.label, { color: t.fg, fontSize: small ? 11.5 : 13 }]}>
        {label}
      </Text>
    </View>
  );
}

const OCR_BADGE: Record<OcrStatus, { label: string; tone: BadgeTone; icon: IconName }> = {
  idle: { label: 'Bez OCR', tone: 'neutral', icon: 'pending' },
  pending: { label: 'Czytam…', tone: 'primary', icon: 'ai' },
  done: { label: 'Odczytany', tone: 'success', icon: 'check' },
  error: { label: 'Błąd odczytu', tone: 'danger', icon: 'alert' },
};

export function OcrStatusBadge({
  status,
  size = 'sm',
  style,
}: {
  status: OcrStatus;
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
}) {
  const spec = OCR_BADGE[status];
  return <Badge label={spec.label} tone={spec.tone} icon={spec.icon} size={size} style={style} />;
}

const AI_BADGE: Record<AiStatus, { label: string; tone: BadgeTone; icon: IconName }> = {
  idle: { label: 'Bez AI', tone: 'neutral', icon: 'pending' },
  pending: { label: 'AI…', tone: 'primary', icon: 'ai' },
  done: { label: 'AI', tone: 'success', icon: 'ai' },
  error: { label: 'Błąd AI', tone: 'danger', icon: 'alert' },
};

export function AiStatusBadge({
  status,
  size = 'sm',
  style,
}: {
  status: AiStatus;
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
}) {
  const spec = AI_BADGE[status];
  return <Badge label={spec.label} tone={spec.tone} icon={spec.icon} size={size} style={style} />;
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  label: {
    fontWeight: '700',
    letterSpacing: -0.1,
  },
});
