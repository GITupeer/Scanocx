import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from './Button';
import { colors, font, space } from './theme';

type Props = {
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  /** Ukryj strzałkę powrotu (ekrany-korzenie). */
  hideBack?: boolean;
  right?: React.ReactNode;
  tone?: 'light' | 'dark';
  style?: StyleProp<ViewStyle>;
};

export function AppBar({ title, subtitle, onBack, hideBack, right, tone = 'light', style }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dark = tone === 'dark';

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + space.sm }, style]}>
      {hideBack ? null : (
        <IconButton
          name="back"
          accessibilityLabel="Wróć"
          variant={dark ? 'glass' : 'outline'}
          size={42}
          round
          onPress={onBack ?? (() => router.back())}
        />
      )}

      <View style={styles.titles}>
        {title ? (
          <Text numberOfLines={1} style={[styles.title, dark && styles.titleDark]}>
            {title}
          </Text>
        ) : null}
        {subtitle ? (
          <Text numberOfLines={1} style={[styles.subtitle, dark && styles.subtitleDark]}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
  },
  titles: {
    flex: 1,
    gap: 1,
  },
  title: {
    ...font.h3,
    fontSize: 18,
  },
  titleDark: {
    color: colors.white,
  },
  subtitle: {
    fontSize: 12.5,
    fontWeight: '600',
    color: colors.muted,
    letterSpacing: -0.1,
  },
  subtitleDark: {
    color: 'rgba(255,255,255,0.7)',
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
});
