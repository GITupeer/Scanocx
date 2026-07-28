import { StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { Gradient } from './Gradient';
import { colors } from './theme';

const COVERS: readonly (readonly [string, string])[] = [
  ['#7C5CFF', '#4C7DF5'],
  ['#14C9A6', '#2FA8E8'],
  ['#FF7A9A', '#8B5CFF'],
  ['#F7B733', '#EE7752'],
  ['#4C7DF5', '#22C3D6'],
  ['#9B5CFF', '#E24B41'],
];

function hash(value: string): number {
  let total = 0;
  for (let i = 0; i < value.length; i += 1) {
    total = (total * 31 + value.charCodeAt(i)) % 100000;
  }
  return total;
}

function initials(title: string): string {
  const words = title
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);
  if (words.length === 0) return '??';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** Zastępcza okładka książki: gradient dobrany z tytułu + inicjały. */
export function BookCover({
  title,
  width = 52,
  style,
}: {
  title: string;
  width?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const gradient = COVERS[hash(title) % COVERS.length];
  const height = Math.round(width * 1.34);

  return (
    <View style={[{ width, height }, style]}>
      <Gradient
        colors={gradient}
        style={[styles.cover, { borderRadius: Math.max(8, Math.round(width * 0.22)) }]}>
        <View style={styles.spine} />
        <Text
          allowFontScaling={false}
          style={[styles.initials, { fontSize: Math.round(width * 0.36) }]}>
          {initials(title)}
        </Text>
      </Gradient>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  spine: {
    position: 'absolute',
    left: '18%',
    top: 0,
    bottom: 0,
    width: 1.5,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  initials: {
    color: colors.white,
    fontWeight: '800',
    letterSpacing: -0.5,
    textShadowColor: 'rgba(0,0,0,0.18)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
