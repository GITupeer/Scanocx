import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';

import { Gradient } from './Gradient';
import { Icon, type IconName } from './Icon';
import { colors, gradients, radius, shadow, space } from './theme';

export type ButtonVariant =
  | 'primary'
  | 'soft'
  | 'outline'
  | 'ghost'
  | 'dark'
  | 'danger'
  | 'dangerSoft'
  | 'glass';

export type ButtonSize = 'sm' | 'md' | 'lg';

type Props = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconRight?: IconName;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
};

const GRADIENT: Partial<Record<ButtonVariant, readonly [string, string, ...string[]]>> = {
  primary: gradients.brand,
  danger: gradients.rose,
};

const FILL: Record<ButtonVariant, ViewStyle> = {
  primary: {},
  danger: {},
  soft: { backgroundColor: colors.primarySoft },
  outline: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  ghost: { backgroundColor: 'transparent' },
  dark: { backgroundColor: colors.ink },
  dangerSoft: { backgroundColor: colors.dangerSoft },
  glass: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
  },
};

const CONTENT_COLOR: Record<ButtonVariant, string> = {
  primary: colors.white,
  danger: colors.white,
  soft: colors.primaryDeep,
  outline: colors.ink,
  ghost: colors.inkSoft,
  dark: colors.white,
  dangerSoft: colors.danger,
  glass: colors.white,
};

const SIZES: Record<ButtonSize, { height: number; padding: number; font: number; icon: number }> = {
  sm: { height: 38, padding: space.md, font: 13.5, icon: 16 },
  md: { height: 50, padding: space.lg, font: 15, icon: 18 },
  lg: { height: 58, padding: space.xl, font: 16, icon: 20 },
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  disabled,
  loading,
  style,
  labelStyle,
  accessibilityLabel,
}: Props) {
  const dims = SIZES[size];
  const tint = CONTENT_COLOR[variant];
  const gradient = GRADIENT[variant];
  const inert = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!inert, busy: !!loading }}
      disabled={inert}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        { height: dims.height, paddingHorizontal: dims.padding, borderRadius: radius.lg },
        FILL[variant],
        gradient ? shadow.soft : null,
        pressed && !inert ? styles.pressed : null,
        disabled ? styles.disabled : null,
        style,
      ]}>
      {gradient ? <Gradient colors={gradient} style={StyleSheet.absoluteFill} /> : null}

      <View style={styles.row}>
        {loading ? (
          <ActivityIndicator size="small" color={tint} />
        ) : icon ? (
          <Icon name={icon} size={dims.icon} color={tint} />
        ) : null}
        <Text
          numberOfLines={1}
          style={[styles.label, { fontSize: dims.font, color: tint }, labelStyle]}>
          {label}
        </Text>
        {iconRight && !loading ? <Icon name={iconRight} size={dims.icon} color={tint} /> : null}
      </View>
    </Pressable>
  );
}

type IconButtonProps = {
  name: IconName;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: number;
  iconSize?: number;
  disabled?: boolean;
  round?: boolean;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
  tint?: string;
};

export function IconButton({
  name,
  onPress,
  variant = 'outline',
  size = 44,
  iconSize,
  disabled,
  round,
  accessibilityLabel,
  style,
  tint,
}: IconButtonProps) {
  const gradient = GRADIENT[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: round ? size / 2 : radius.md,
        },
        FILL[variant],
        pressed && !disabled ? styles.pressed : null,
        disabled ? styles.disabled : null,
        style,
      ]}>
      {gradient ? <Gradient colors={gradient} style={StyleSheet.absoluteFill} /> : null}
      <Icon name={name} size={iconSize ?? Math.round(size * 0.44)} color={tint ?? CONTENT_COLOR[variant]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  label: {
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  disabled: {
    opacity: 0.4,
  },
});
