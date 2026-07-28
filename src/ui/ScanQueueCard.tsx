import { StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { useOcrQueue } from '@/src/ocr/queue';

import { Gradient } from './Gradient';
import { Icon } from './Icon';
import { AiPulse } from './Motion';
import { ProgressBar } from './Progress';
import { colors, font, gradients, radius, shadow, space } from './theme';

/**
 * Żywy status globalnej kolejki OCR. Sam czyta stan kolejki, więc wystarczy
 * wstawić go na dowolnym ekranie.
 */
export function ScanQueueCard({ style }: { style?: StyleProp<ViewStyle> }) {
  const queue = useOcrQueue();

  if (queue.total === 0) return null;

  const done = Math.min(queue.completed, queue.total);
  const detail = queue.paused
    ? 'Wstrzymane — ruszy po wyjściu z kamery'
    : queue.currentPageIndex != null
      ? `Czytam stronę ${queue.currentPageIndex}…`
      : 'Przygotowuję analizę…';

  return (
    <View style={[styles.wrap, style]}>
      <Gradient
        colors={gradients.aurora}
        fallbackColor={colors.primarySoft}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.header}>
        {queue.paused ? (
          <View style={styles.pausedIcon}>
            <Icon name="pause" size={16} color={colors.primary} />
          </View>
        ) : (
          <AiPulse size={34} />
        )}

        <View style={styles.headerText}>
          <Text style={styles.title}>Rozpoznawanie tekstu</Text>
          <Text style={styles.detail}>
            {detail}
            {queue.failed > 0 ? ` · błędy: ${queue.failed}` : ''}
          </Text>
        </View>

        <Text style={styles.counter}>
          {done}
          <Text style={styles.counterTotal}>/{queue.total}</Text>
        </Text>
      </View>

      <ProgressBar
        value={done / queue.total}
        tone={queue.paused ? 'amber' : 'brand'}
        track="rgba(12,14,26,0.08)"
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
  },
  counter: {
    fontSize: 19,
    fontWeight: '800',
    color: colors.primaryDeep,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
  },
  counterTotal: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
  },
  pausedIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
  },
});
