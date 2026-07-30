import { StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { Gradient } from './Gradient';
import { Icon } from './Icon';
import { colors } from './theme';

/** Placeholder gdy strona istnieje na backendzie, ale brak lokalnego JPEG. */
export function PageImagePlaceholder({
  label = 'Brak zdjęcia',
  style,
  compact = false,
}: {
  label?: string;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}) {
  return (
    <Gradient colors={['#5B6472', '#3A4150']} style={[styles.root, style]}>
      <View style={styles.inner}>
        <Icon name="image" size={compact ? 18 : 28} color="rgba(255,255,255,0.75)" />
        {!compact ? <Text style={styles.label}>{label}</Text> : null}
      </View>
    </Gradient>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  inner: {
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  label: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '600',
    opacity: 0.85,
    textAlign: 'center',
  },
});
