import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useGeminiDebug } from '@/src/ai/debugLog';
import { useAiQueue } from '@/src/ai/queue';

import { Button } from './Button';
import { Gradient } from './Gradient';
import { Icon } from './Icon';
import { AiPulse } from './Motion';
import { ProgressBar } from './Progress';
import { colors, font, gradients, radius, shadow, space } from './theme';
import type { StyleProp, ViewStyle } from 'react-native';

function formatElapsed(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatMs(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

/** Status kolejki AI + podgląd surowej odpowiedzi Gemini po tapnięciu. */
export function AiQueueCard({ style }: { style?: StyleProp<ViewStyle> }) {
  const queue = useAiQueue();
  const debug = useGeminiDebug();
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();

  const hasQueue = queue.total > 0;
  const hasDebug = debug != null;

  if (!hasQueue && !hasDebug) return null;

  const done = Math.min(queue.completed, queue.total);
  const batchInfo =
    queue.batchIndex > 0 && queue.batchCount > 0
      ? `${queue.batchIndex}/${queue.batchCount}`
      : null;
  const pagesInfo = queue.currentBatchLabel ?? (hasDebug ? 'Ostatnia odpowiedź Gemini' : 'kolejka…');
  const phaseLine = hasQueue
    ? queue.queuePosition != null && queue.queuePosition > 0
      ? `Pozycja w kolejce: ${queue.queuePosition}${queue.phaseDetail ? ` · ${queue.phaseDetail}` : ''}`
      : queue.phaseDetail || 'Przygotowuję korektę…'
    : 'Dotknij, aby zobaczyć surową odpowiedź';
  const timeLine = queue.running && queue.elapsedSec > 0 ? ` · ${formatElapsed(queue.elapsedSec)}` : '';

  const onShare = async () => {
    if (!debug) return;
    const message = [
      `Model: ${debug.model}`,
      `Stron: ${debug.pageCount}`,
      `HTTP: ${debug.httpStatus ?? '—'}`,
      `finishReason: ${debug.finishReason ?? '—'}`,
      `czas: ${formatMs(debug.elapsedMs)}`,
      debug.error ? `błąd: ${debug.error}` : null,
      '',
      '--- modelText ---',
      debug.modelText ?? '(brak)',
      '',
      '--- raw API ---',
      debug.rawApiJson || '(brak)',
    ]
      .filter((line) => line != null)
      .join('\n');

    await Share.share({ message, title: 'Odpowiedź Gemini' });
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Podgląd odpowiedzi Gemini"
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.wrap, style, pressed && styles.pressed]}>
        <Gradient
          colors={gradients.aurora}
          fallbackColor={colors.primarySoft}
          style={StyleSheet.absoluteFill}
        />

        <View style={styles.header}>
          {hasQueue ? <AiPulse size={34} /> : <Icon name="ai" size={22} color={colors.primaryDeep} />}

          <View style={styles.headerText}>
            <Text style={styles.title}>{hasQueue ? 'Korekta AI (chmura)' : 'Status AI'}</Text>
            <Text style={styles.detail}>
              {batchInfo ? `${batchInfo} · ${pagesInfo}` : pagesInfo}
              {queue.failed > 0 ? ` · błędy: ${queue.failed}` : ''}
            </Text>
            <Text style={styles.phase} numberOfLines={3}>
              {phaseLine}
              {timeLine}
            </Text>
            {queue.lastError || debug?.error ? (
              <Text style={styles.error} numberOfLines={3}>
                {queue.lastError ?? debug?.error}
              </Text>
            ) : null}
            <Text style={styles.hint}>Dotknij, aby podejrzeć surową odpowiedź</Text>
          </View>

          {hasQueue ? (
            <Text style={styles.counter}>
              {done}
              <Text style={styles.counterTotal}>/{queue.total}</Text>
            </Text>
          ) : null}
        </View>

        {hasQueue ? (
          <ProgressBar
            value={queue.total > 0 ? done / queue.total : 0}
            tone="brand"
            track="rgba(12,14,26,0.08)"
          />
        ) : null}
      </Pressable>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={[styles.modal, { paddingTop: insets.top + space.md }]}>
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderText}>
              <Text style={styles.modalTitle}>Odpowiedź Gemini</Text>
              {debug ? (
                <Text style={styles.modalMeta}>
                  {debug.model} · {debug.pageCount} stron · HTTP {debug.httpStatus ?? '—'} ·{' '}
                  {debug.finishReason ?? '—'} · {formatMs(debug.elapsedMs)}
                </Text>
              ) : (
                <Text style={styles.modalMeta}>Brak zapisanej odpowiedzi — uruchom korektę AI.</Text>
              )}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Zamknij"
              onPress={() => setOpen(false)}
              style={styles.closeBtn}>
              <Icon name="close" size={18} color={colors.ink} />
            </Pressable>
          </View>

          {debug?.error ? <Text style={styles.modalError}>{debug.error}</Text> : null}

          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={{ paddingBottom: insets.bottom + space.xl }}
            showsVerticalScrollIndicator>
            <Text style={styles.sectionLabel}>Tekst modelu (JSON)</Text>
            <Text selectable style={styles.code}>
              {debug?.modelText?.trim() || '(pusty — patrz raw API poniżej)'}
            </Text>

            <Text style={[styles.sectionLabel, styles.sectionGap]}>Surowy response API</Text>
            <Text selectable style={styles.code}>
              {debug?.rawApiJson?.trim() || '(brak)'}
            </Text>
          </ScrollView>

          <View style={[styles.modalFooter, { paddingBottom: Math.max(insets.bottom, space.md) }]}>
            <Button
              label="Udostępnij"
              icon="share"
              variant="outline"
              disabled={!debug}
              onPress={() => void onShare()}
              style={styles.footerBtn}
            />
            <Button label="Zamknij" onPress={() => setOpen(false)} style={styles.footerBtn} />
          </View>
        </View>
      </Modal>
    </>
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
  pressed: {
    opacity: 0.92,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
  },
  headerText: {
    flex: 1,
    gap: 3,
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
  phase: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.inkSoft,
    lineHeight: 16,
  },
  error: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.danger,
    lineHeight: 16,
  },
  hint: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '600',
    color: colors.primaryDeep,
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
  modal: {
    flex: 1,
    backgroundColor: colors.canvas,
    paddingHorizontal: space.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    marginBottom: space.md,
  },
  modalHeaderText: {
    flex: 1,
    gap: 4,
  },
  modalTitle: {
    ...font.h2,
  },
  modalMeta: {
    fontSize: 12.5,
    fontWeight: '500',
    color: colors.muted,
    lineHeight: 17,
  },
  modalError: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.danger,
    marginBottom: space.md,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  modalScroll: {
    flex: 1,
  },
  sectionLabel: {
    ...font.caption,
    color: colors.primary,
    marginBottom: space.sm,
  },
  sectionGap: {
    marginTop: space.xl,
  },
  code: {
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'monospace',
    color: colors.ink,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.md,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: space.sm,
    paddingTop: space.md,
  },
  footerBtn: {
    flex: 1,
  },
});
