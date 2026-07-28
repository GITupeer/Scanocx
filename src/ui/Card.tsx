import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';

import { Icon, type IconName } from './Icon';
import { colors, font, radius, shadow, space } from './theme';

type CardProps = {
  children: React.ReactNode;
  elevation?: 'flat' | 'soft' | 'card';
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Card({ children, elevation = 'soft', padded = true, style }: CardProps) {
  return (
    <View
      style={[
        styles.card,
        padded && styles.cardPadded,
        elevation === 'soft' ? shadow.soft : null,
        elevation === 'card' ? shadow.card : null,
        style,
      ]}>
      {children}
    </View>
  );
}

export function Divider({ inset = 0 }: { inset?: number }) {
  return <View style={[styles.divider, { marginLeft: inset }]} />;
}

type SectionHeaderProps = {
  title: string;
  action?: { label: string; onPress: () => void };
  style?: StyleProp<ViewStyle>;
};

export function SectionHeader({ title, action, style }: SectionHeaderProps) {
  return (
    <View style={[styles.sectionHeader, style]}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action ? (
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={action.onPress}
          style={({ pressed }) => [styles.sectionAction, pressed && styles.rowPressed]}>
          <Text style={styles.sectionActionLabel}>{action.label}</Text>
          <Icon name="chevronRight" size={14} color={colors.primary} />
        </Pressable>
      ) : null}
    </View>
  );
}

export type RowTone = 'default' | 'primary' | 'danger' | 'success';

const ROW_TINT: Record<RowTone, { bg: string; fg: string }> = {
  default: { bg: colors.surfaceMuted, fg: colors.inkSoft },
  primary: { bg: colors.primarySoft, fg: colors.primary },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
  success: { bg: colors.successSoft, fg: colors.success },
};

type RowProps = {
  icon?: IconName;
  label: string;
  detail?: string;
  value?: string;
  tone?: RowTone;
  onPress?: () => void;
  disabled?: boolean;
  chevron?: boolean;
  right?: React.ReactNode;
  labelStyle?: StyleProp<TextStyle>;
};

/** Wiersz listy w karcie — używany w menu, arkuszach i ustawieniach. */
export function Row({
  icon,
  label,
  detail,
  value,
  tone = 'default',
  onPress,
  disabled,
  chevron,
  right,
  labelStyle,
}: RowProps) {
  const tint = ROW_TINT[tone];
  const body = (
    <>
      {icon ? (
        <View style={[styles.rowIcon, { backgroundColor: tint.bg }]}>
          <Icon name={icon} size={18} color={tint.fg} />
        </View>
      ) : null}
      <View style={styles.rowText}>
        <Text
          style={[
            styles.rowLabel,
            tone === 'danger' && { color: colors.danger },
            tone === 'primary' && { color: colors.primaryDeep },
            labelStyle,
          ]}>
          {label}
        </Text>
        {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
      </View>
      {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      {right}
      {chevron ? <Icon name="chevronRight" size={16} color={colors.faint} /> : null}
    </>
  );

  if (!onPress) {
    return <View style={styles.row}>{body}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed, disabled && styles.rowDisabled]}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  cardPadded: {
    padding: space.lg,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.sm,
  },
  sectionTitle: {
    ...font.caption,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  sectionAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
  },
  sectionActionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: -0.2,
  },
  row: {
    minHeight: 58,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  rowPressed: {
    backgroundColor: colors.pressTint,
  },
  rowDisabled: {
    opacity: 0.45,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    fontSize: 15.5,
    fontWeight: '600',
    letterSpacing: -0.2,
    color: colors.ink,
  },
  rowDetail: {
    fontSize: 12.5,
    color: colors.muted,
    lineHeight: 17,
  },
  rowValue: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.muted,
    fontVariant: ['tabular-nums'],
  },
});
