/**
 * Sandbox: dewarp UVDoc + enhanceScanClarity na zeskanowanych stronach.
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { recognizeText } from 'expo-mlkit-ocr';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { dewarpImageUri, isUvdocNativeAvailable } from '@/src/images/dewarp';
import { enhanceScanClarity } from '@/src/images/enhanceScanClarity';
import { getBook, listBooks, replacePageFromCameraUri } from '@/src/storage/books';
import {
  AppBar,
  Button,
  colors,
  radius,
  shadow,
  space,
} from '@/src/ui';

type ScanItem = {
  key: string;
  bookId: string;
  bookTitle: string;
  pageId: string;
  pageIndex: number;
  imageUri: string;
};

type Timing = {
  label: string;
  msTotal: number;
  detail: string;
};

type PipelineMode = 'enhance' | 'dewarp' | 'dewarp+enhance';

function toFileUri(path: string): string {
  if (!path) return path;
  if (path.startsWith('file://') || path.startsWith('content://')) return path;
  return `file://${path}`;
}

export default function DewarpTestScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const nativeOk = isUvdocNativeAvailable();

  const [scans, setScans] = useState<ScanItem[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selected, setSelected] = useState<ScanItem | null>(null);
  const [beforeUri, setBeforeUri] = useState<string | null>(null);
  const [resultUri, setResultUri] = useState<string | null>(null);
  const [showAfter, setShowAfter] = useState(true);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [timing, setTiming] = useState<Timing | null>(null);
  const [ocrText, setOcrText] = useState<string | null>(null);
  const [ocrEngine, setOcrEngine] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoadingList(true);
      try {
        const books = await listBooks();
        const items: ScanItem[] = [];
        for (const summary of books) {
          if (summary.pageCount === 0) continue;
          try {
            const book = await getBook(summary.id);
            for (const page of book.pages) {
              if (!page.imageUri?.trim()) continue;
              items.push({
                key: `${book.id}:${page.id}`,
                bookId: book.id,
                bookTitle: book.title,
                pageId: page.id,
                pageIndex: page.index,
                imageUri: toFileUri(page.imageUri),
              });
            }
          } catch {
            // pomiń uszkodzoną książkę
          }
        }
        if (!cancelled) setScans(items);
      } catch (error) {
        if (!cancelled) {
          Alert.alert(
            'Skanowanie',
            error instanceof Error ? error.message : 'Nie udało się wczytać skanów.'
          );
        }
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectScan = useCallback((item: ScanItem) => {
    setSelected(item);
    setBeforeUri(null);
    setResultUri(null);
    setTiming(null);
    setOcrText(null);
    setOcrEngine(null);
    setShowAfter(true);
    setHint(null);
  }, []);

  const saveAsPageImage = useCallback(
    async (outputUri: string, beforeCache: string) => {
      if (!selected) return;
      setHint('Zapisuję jako zdjęcie strony…');
      const { page } = await replacePageFromCameraUri(
        selected.bookId,
        selected.pageId,
        outputUri
      );
      const savedUri = toFileUri(page.imageUri);
      const updated: ScanItem = { ...selected, imageUri: savedUri };
      setSelected(updated);
      setScans((prev) =>
        prev.map((item) => (item.key === updated.key ? updated : item))
      );
      setBeforeUri(beforeCache);
      setResultUri(savedUri);
      setShowAfter(true);
    },
    [selected]
  );

  const runPipeline = useCallback(
    async (mode: PipelineMode) => {
      if (!selected || busy) return;
      const needsTflite = mode !== 'enhance';
      if (needsTflite && !nativeOk) {
        Alert.alert(
          'Wymagany nowy build',
          'react-native-fast-tflite nie jest w tym kliencie. Zrób development build (EAS / prebuild).'
        );
        return;
      }

      setBusy(true);
      setBeforeUri(null);
      setResultUri(null);
      setTiming(null);
      setOcrText(null);
      setOcrEngine(null);
      try {
        const beforeCache = `${FileSystem.cacheDirectory}dewarp-before-${Date.now()}.jpg`;
        await FileSystem.copyAsync({ from: selected.imageUri, to: beforeCache });

        let workingUri = selected.imageUri;
        const detailParts: string[] = [];
        const t0 = Date.now();

        if (mode === 'dewarp' || mode === 'dewarp+enhance') {
          setHint('Inferencja UVDoc…');
          const dew = await dewarpImageUri(workingUri);
          workingUri = dew.outputUri;
          detailParts.push(`Dewarp ${dew.msInference + dew.msRemap} ms`);
        }

        if (mode === 'enhance' || mode === 'dewarp+enhance') {
          setHint('Enhance (dokument)…');
          const tEnh0 = Date.now();
          workingUri = await enhanceScanClarity(workingUri, { mode: 'document' });
          detailParts.push(`Enhance ${Date.now() - tEnh0} ms`);
        }

        await saveAsPageImage(workingUri, beforeCache);
        setTiming({
          label: mode,
          msTotal: Date.now() - t0,
          detail: detailParts.join(' · '),
        });
        setHint(null);
        Alert.alert(
          'Zapisano',
          'Wynik zastąpił skan strony. OCR został zresetowany — uruchom go ponownie na stronie.'
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Nie udało się przetworzyć skanu.';
        Alert.alert('Przetwarzanie', message);
        setHint(null);
      } finally {
        setBusy(false);
      }
    },
    [busy, nativeOk, saveAsPageImage, selected]
  );

  const runOcr = useCallback(async () => {
    if (!selected || busy) return;

    setBusy(true);
    setHint('ML Kit OCR…');
    setOcrText(null);
    setOcrEngine(null);
    setTiming(null);
    try {
      const uri = selected.imageUri;
      const t0 = Date.now();
      const result = await recognizeText(uri);
      const ms = Date.now() - t0;
      const text = (result.text ?? '').trim() || '(brak tekstu)';
      setOcrText(text);
      setOcrEngine('ML Kit');
      setTiming({
        label: 'mlkit',
        msTotal: ms,
        detail: `ML Kit ${ms} ms`,
      });
      setHint(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Nie udało się odczytać OCR.';
      Alert.alert('OCR', message);
      setHint(null);
    } finally {
      setBusy(false);
    }
  }, [busy, selected]);

  const shareResult = useCallback(async () => {
    if (!resultUri) return;
    const can = await Sharing.isAvailableAsync();
    if (!can) {
      Alert.alert('Udostępnianie', 'Niedostępne na tym urządzeniu.');
      return;
    }
    await Sharing.shareAsync(resultUri, { mimeType: 'image/jpeg' });
  }, [resultUri]);

  const previewUri =
    showAfter && resultUri
      ? resultUri
      : beforeUri && resultUri
        ? beforeUri
        : selected
          ? selected.imageUri
          : null;

  return (
    <View style={[styles.root, { paddingBottom: insets.bottom + space.md }]}>
      <AppBar
        title="Test preprocess / OCR"
        subtitle="UVDoc · enhance · ML Kit"
        onBack={() => router.back()}
      />

      <ScrollView
        style={styles.bodyScroll}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled">
        {!nativeOk ? (
          <View style={styles.banner}>
            <Text style={styles.bannerTitle}>Wymagany nowy development client</Text>
            <Text style={styles.bannerBody}>
              Dewarp wymaga react-native-fast-tflite. Enhance i ML Kit działają bez nowego
              builda TFLite.
            </Text>
          </View>
        ) : null}

        <View style={styles.previewWrap}>
          {previewUri ? (
            <Image source={{ uri: previewUri }} style={styles.preview} resizeMode="contain" />
          ) : (
            <View style={styles.previewEmpty}>
              <Text style={styles.previewEmptyText}>
                Wybierz skan z listy poniżej
              </Text>
            </View>
          )}
          {busy ? (
            <View style={styles.busyOverlay}>
              <ActivityIndicator color="#fff" size="large" />
              {hint ? <Text style={styles.busyHint}>{hint}</Text> : null}
            </View>
          ) : null}
        </View>

        {selected ? (
          <Text style={styles.selectionLabel} numberOfLines={1}>
            {selected.bookTitle} · str. {selected.pageIndex + 1}
          </Text>
        ) : null}

        {resultUri ? (
          <View style={styles.toggleRow}>
            <Pressable
              onPress={() => setShowAfter(false)}
              style={[styles.toggle, !showAfter && styles.toggleOn]}>
              <Text style={[styles.toggleText, !showAfter && styles.toggleTextOn]}>Przed</Text>
            </Pressable>
            <Pressable
              onPress={() => setShowAfter(true)}
              style={[styles.toggle, showAfter && styles.toggleOn]}>
              <Text style={[styles.toggleText, showAfter && styles.toggleTextOn]}>Po</Text>
            </Pressable>
          </View>
        ) : null}

        {timing ? (
          <Text style={styles.timing}>
            {timing.detail} · Razem {timing.msTotal} ms
          </Text>
        ) : null}

        <View style={styles.actions}>
          <Button
            label="Enhance (jak skaner)"
            variant="soft"
            icon="tune"
            disabled={!selected || busy}
            loading={busy}
            onPress={() => void runPipeline('enhance')}
          />
          <Button
            label="Dewarp (UVDoc)"
            icon="scan"
            disabled={!selected || busy || !nativeOk}
            loading={busy}
            onPress={() => void runPipeline('dewarp')}
          />
          <Button
            label="Dewarp + enhance"
            variant="soft"
            icon="ai"
            disabled={!selected || busy || !nativeOk}
            loading={busy}
            onPress={() => void runPipeline('dewarp+enhance')}
          />
          <Button
            label="OCR · ML Kit"
            variant="outline"
            icon="text"
            disabled={!selected || busy}
            loading={busy}
            onPress={() => void runOcr()}
          />
          {resultUri ? (
            <Button
              label="Udostępnij wynik"
              variant="outline"
              icon="share"
              onPress={() => void shareResult()}
            />
          ) : null}
        </View>

        {ocrText ? (
          <View style={styles.ocrBox}>
            <Text style={styles.ocrTitle}>{ocrEngine ?? 'OCR'}</Text>
            <Text style={styles.ocrBody} selectable>
              {ocrText}
            </Text>
          </View>
        ) : null}

        <Text style={styles.listTitle}>Zeskanowane strony</Text>

        {loadingList ? (
          <View style={styles.listLoading}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : scans.length === 0 ? (
          <Text style={styles.emptyList}>
            Brak skanów. Najpierw zrób zdjęcia stron w książce.
          </Text>
        ) : (
          <FlatList
            data={scans}
            keyExtractor={(item) => item.key}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.scanList}
            renderItem={({ item }) => {
              const active = selected?.key === item.key;
              return (
                <Pressable
                  onPress={() => selectScan(item)}
                  style={[styles.scanCard, active && styles.scanCardOn]}>
                  <Image
                    source={{ uri: item.imageUri }}
                    style={styles.scanThumb}
                    resizeMode="cover"
                  />
                  <Text style={styles.scanMeta} numberOfLines={2}>
                    {item.bookTitle}
                  </Text>
                  <Text style={styles.scanPage}>str. {item.pageIndex + 1}</Text>
                </Pressable>
              );
            }}
          />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  bodyScroll: {
    flex: 1,
  },
  body: {
    paddingHorizontal: space.lg,
    paddingBottom: space.xxl,
    gap: space.md,
  },
  banner: {
    backgroundColor: 'rgba(180, 80, 40, 0.12)',
    borderRadius: radius.md,
    padding: space.md,
    gap: 4,
  },
  bannerTitle: {
    color: colors.ink,
    fontWeight: '700',
    fontSize: 14,
  },
  bannerBody: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  previewWrap: {
    height: 220,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    ...shadow.card,
  },
  preview: {
    width: '100%',
    height: '100%',
  },
  previewEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
  },
  previewEmptyText: {
    color: colors.muted,
    textAlign: 'center',
    fontSize: 15,
  },
  busyOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 42, 46, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  busyHint: {
    color: '#fff',
    fontSize: 13,
  },
  selectionLabel: {
    color: colors.inkSoft,
    fontSize: 13,
    fontWeight: '600',
  },
  toggleRow: {
    flexDirection: 'row',
    gap: space.sm,
  },
  toggle: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  toggleOn: {
    backgroundColor: colors.ink,
  },
  toggleText: {
    color: colors.muted,
    fontWeight: '600',
    fontSize: 14,
  },
  toggleTextOn: {
    color: '#fff',
  },
  timing: {
    color: colors.muted,
    fontSize: 12,
    textAlign: 'center',
  },
  actions: {
    gap: space.sm,
  },
  ocrBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: space.md,
    gap: 6,
    maxHeight: 220,
    ...shadow.soft,
  },
  ocrTitle: {
    color: colors.ink,
    fontWeight: '700',
    fontSize: 13,
  },
  ocrBody: {
    color: colors.inkSoft,
    fontSize: 13,
    lineHeight: 19,
  },
  listTitle: {
    color: colors.ink,
    fontWeight: '700',
    fontSize: 15,
  },
  listLoading: {
    paddingVertical: space.xl,
    alignItems: 'center',
  },
  emptyList: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  scanList: {
    gap: space.sm,
    paddingBottom: space.md,
  },
  scanCard: {
    width: 110,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: 6,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  scanCardOn: {
    borderColor: colors.primary,
  },
  scanThumb: {
    width: '100%',
    height: 130,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSunken,
  },
  scanMeta: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: '600',
    color: colors.ink,
  },
  scanPage: {
    fontSize: 11,
    color: colors.muted,
  },
});
