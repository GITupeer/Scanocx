import { Modal, StyleSheet, Text, View } from 'react-native';

import { AiPulse } from './Motion';
import { colors, font, radius, shadow, space } from './theme';

export function Loader({ label = 'Ładowanie…' }: { label?: string }) {
  return (
    <View style={styles.screen}>
      <AiPulse size={44} />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

export function BusyOverlay({ visible, label = 'Przetwarzanie…' }: { visible: boolean; label?: string }) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <AiPulse size={40} />
          <Text style={styles.cardLabel}>{label}</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.lg,
    backgroundColor: colors.canvas,
  },
  label: {
    ...font.small,
    fontWeight: '600',
  },
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.scrim,
    padding: space.xxl,
  },
  card: {
    minWidth: 190,
    paddingVertical: space.xxl,
    paddingHorizontal: space.xxl,
    borderRadius: radius.xxl,
    backgroundColor: colors.surface,
    alignItems: 'center',
    gap: space.lg,
    ...shadow.card,
  },
  cardLabel: {
    ...font.bodyStrong,
    textAlign: 'center',
  },
});
