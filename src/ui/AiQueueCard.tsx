import { StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { useAiQueue } from '@/src/ai/queue';

import { Gradient } from './Gradient';
import { Icon } from './Icon';
import { AiPulse } from './Motion';
import { ProgressBar } from './Progress';
import { colors, font, gradients, radius, shadow, space } from './theme';

function userDetail(queue: ReturnType<typeof useAiQueue>): string {
  if (queue.lastError) return queue.lastError;
  if (queue.queuePosition != null && queue.queuePosition > 1) {
    return `W kolejce — pozycja ${queue.queuePosition}`;
  }
  if (queue.phase === 'preparing' || queue.phase === 'sending') {
    return 'Wysyłam strony do chmury…';
  }
  if (queue.phase === 'queued' || queue.phase === 'waiting') {
    return 'Oczekiwanie w kolejce…';
  }
  if (queue.phase === 'saving' || queue.phase === 'parsing') {
    return 'Zapisuję wyniki…';
  }
  if (queue.failed > 0) {
    return `Przetwarzanie… · błędy: ${queue.failed}`;
  }
  return 'Analiza AI w toku…';
}

/**
 * Status kolejki korekty AI w chmurze — czytelny dla użytkownika końcowego.
 */
export function AiQueueCard({ style }: { style?: StyleProp<ViewStyle> }) {
  const queue = useAiQueue();

  if (queue.total === 0) return null;

  const done = Math.min(queue.completed, queue.total);

  return (
    <View style={[styles.wrap, style]}>
      <Gradient
        colors={gradients.aurora}
        fallbackColor={colors.primarySoft}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.header}>
        {queue.lastError ? (
          <View style={styles.errorIcon}>
            <Icon name="ai" size={16} color={colors.danger} />
          </View>
        ) : (
          <AiPulse size={34} />
        )}

        <View style={styles.headerText}>
          <Text style={styles.title}>Korekta AI</Text>
          <Text style={styles.detail} numberOfLines={2}>
            {userDetail(queue)}
          </Text>
        </View>

        <Text style={styles.counter}>
          {done}
          <Text style={styles.counterTotal}>/{queue.total}</Text>
        </Text>
      </View>

      <ProgressBar
        value={queue.total > 0 ? done / queue.total : 0}
        tone={queue.lastError ? 'amber' : 'brand'}
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
  errorIcon: {
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
