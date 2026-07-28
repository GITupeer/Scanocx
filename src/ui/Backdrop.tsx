import { StyleSheet, View } from 'react-native';

import { Gradient } from './Gradient';
import { colors, gradients } from './theme';

/**
 * Delikatna „zorza” u góry ekranu — tło ekranów-korzeni.
 * Renderuje się pod treścią (pointerEvents: none).
 */
export function AuroraBackdrop({ height = 380, warm = false }: { height?: number; warm?: boolean }) {
  return (
    <View pointerEvents="none" style={[styles.wrap, { height }]}>
      <Gradient
        colors={warm ? gradients.auroraWarm : gradients.aurora}
        angle={155}
        fallbackColor={colors.canvasDeep}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.blob, styles.blobViolet]} />
      <View style={[styles.blob, styles.blobBlue]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
  },
  blob: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    opacity: 0.22,
  },
  blobViolet: {
    top: -110,
    right: -70,
    backgroundColor: colors.violet,
  },
  blobBlue: {
    top: 40,
    left: -120,
    backgroundColor: colors.blue,
    opacity: 0.16,
  },
});
