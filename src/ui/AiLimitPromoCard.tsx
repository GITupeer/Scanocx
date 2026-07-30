import { StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { pages as pagesLabel } from '@/src/utils/format';
import { PRO_AI_MONTHLY_LIMIT } from '@/src/plans/features';

import { Button } from './Button';
import { Gradient } from './Gradient';
import { Icon } from './Icon';
import { colors, font, gradients, radius, shadow, space } from './theme';

type Props = {
  /** Ile stron nadal czeka na korektę (poza limitem). */
  count: number;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
};

/**
 * Limit AI wyczerpany — zachęta do subskrypcji zamiast komunikatu błędu.
 */
export function AiLimitPromoCard({ count, onPress, style }: Props) {
  if (count <= 0) return null;

  const waiting = pagesLabel(count);
  const title = 'Limit tokenów AI wykorzystany';
  const detail =
    count === 1
      ? `Została ${waiting} bez korekty. Pro: ${PRO_AI_MONTHLY_LIMIT.toLocaleString('pl-PL')} tokenów (~1000 stron).`
      : `Zostało ${waiting} bez korekty. Pro: ${PRO_AI_MONTHLY_LIMIT.toLocaleString('pl-PL')} tokenów (~1000 stron).`;

  return (
    <View style={[styles.wrap, style]}>
      <Gradient
        colors={gradients.aurora}
        fallbackColor={colors.primarySoft}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <Icon name="bolt" size={18} color={colors.primary} />
        </View>

        <View style={styles.headerText}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.detail} numberOfLines={2}>
            {detail}
          </Text>
        </View>

        <Text style={styles.counter}>{count}</Text>
      </View>

      <Button label="Kup subskrypcję" icon="bolt" size="sm" onPress={onPress} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radius.xl,
    padding: space.lg,
    gap: space.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.line,
    ...shadow.soft,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...font.h3,
    fontSize: 15.5,
  },
  detail: {
    fontSize: 12.5,
    fontWeight: '500',
    color: colors.muted,
    lineHeight: 17,
  },
  counter: {
    fontSize: 19,
    fontWeight: '800',
    color: colors.primaryDeep,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
  },
});
