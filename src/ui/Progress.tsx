import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { Gradient } from './Gradient';
import { colors, gradients, radius } from './theme';

type Props = {
  /** 0…1 */
  value: number;
  height?: number;
  tone?: 'brand' | 'mint' | 'amber';
  track?: string;
  style?: StyleProp<ViewStyle>;
};

export function ProgressBar({ value, height = 6, tone = 'brand', track, style }: Props) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const gradient =
    tone === 'mint' ? gradients.mint : tone === 'amber' ? gradients.amber : gradients.brand;

  return (
    <View
      style={[
        styles.track,
        { height, borderRadius: height / 2, backgroundColor: track ?? colors.surfaceSunken },
        style,
      ]}>
      <Gradient
        colors={gradient}
        angle={90}
        style={{
          width: `${clamped * 100}%`,
          height: '100%',
          borderRadius: height / 2,
          minWidth: clamped > 0 ? height : 0,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    overflow: 'hidden',
    borderRadius: radius.pill,
  },
});
