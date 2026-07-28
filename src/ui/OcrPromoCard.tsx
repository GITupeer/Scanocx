import { StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { pages as pagesLabel, plural } from '@/src/utils/format';

import { Button } from './Button';
import { Gradient } from './Gradient';
import { Icon } from './Icon';
import { colors, font, gradients, radius, shadow, space } from './theme';

type Props = {
  count: number;
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * Zachęta do OCR, gdy książka ma zdjęcia bez odczytanego tekstu.
 */
export function OcrPromoCard({ count, onPress, disabled, style }: Props) {
  if (count <= 0) return null;

  const label = pagesLabel(count);
  const waiting = plural(count, 'czeka', 'czekają', 'czeka');
  const title = `${label} ${waiting} na odczyt tekstu`;
  const detail =
    count === 1
      ? 'Uruchom OCR — rozpoznamy tekst ze zdjęcia lokalnie na urządzeniu.'
      : 'Uruchom OCR — rozpoznamy tekst ze skanów lokalnie na urządzeniu.';

  return (
    <View style={[styles.wrap, style]}>
      <Gradient
        colors={gradients.aurora}
        fallbackColor={colors.primarySoft}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <Icon name="scan" size={18} color={colors.primary} />
        </View>

        <View style={styles.headerText}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.detail} numberOfLines={2}>
            {detail}
          </Text>
        </View>

        <Text style={styles.counter}>{count}</Text>
      </View>

      <Button
        label="Odczytaj tekst"
        icon="scan"
        size="sm"
        onPress={onPress}
        disabled={disabled}
      />
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
