import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isApiConfigured } from '@/src/ai/config';
import {
  cancelAiForPage,
  runPageAiExclusive,
  useAiQueue,
} from '@/src/ai/queue';
import { ApiError } from '@/src/api/types';
import { useAuth } from '@/src/auth/AuthProvider';
import type { Book, BookPage } from '@/src/domain/types';
import { isLandscapeUri } from '@/src/images/ensurePortrait';
import { cancelOcrForPage, runPageOcrExclusive, useOcrQueue } from '@/src/ocr/queue';
import {
  deletePage,
  getBook,
  persistPortraitPageImage,
  rotatePageImage180,
  updatePageAi,
  updatePageOcr,
} from '@/src/storage/books';
import {
  AiQueueCard,
  AiStatusBadge,
  AppBar,
  Button,
  ConfirmDialog,
  Icon,
  IconButton,
  Loader,
  OcrStatusBadge,
  Row,
  ScanQueueCard,
  Sheet,
  SheetGroup,
  TextField,
  colors,
  radius,
  shadow,
  space,
} from '@/src/ui';

type TextTab = 'ai' | 'ocr';

export default function PageDetailScreen() {
  const { id, pageId } = useLocalSearchParams<{ id: string; pageId: string }>();
  const router = useRouter();
  const { isLoggedIn } = useAuth();
  const insets = useSafeAreaInsets();
  const [book, setBook] = useState<Book | null>(null);
  const [page, setPage] = useState<BookPage | null>(null);
  const [ocrText, setOcrText] = useState('');
  const [aiText, setAiText] = useState('');
  const [printedPageNumber, setPrintedPageNumber] = useState('');
  const [textTab, setTextTab] = useState<TextTab>('ai');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [runningOcr, setRunningOcr] = useState(false);
  const [runningAi, setRunningAi] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const ocrQueue = useOcrQueue();
  const aiQueue = useAiQueue();

  const pagesOrdered = useMemo(() => {
    if (!book) return [];
    return [...book.pages].sort((a, b) => a.index - b.index);
  }, [book]);

  const currentPos = useMemo(() => {
    if (!page) return { index: -1, prev: null as BookPage | null, next: null as BookPage | null };
    const index = pagesOrdered.findIndex((p) => p.id === page.id);
    return {
      index,
      prev: index > 0 ? pagesOrdered[index - 1] : null,
      next: index >= 0 && index < pagesOrdered.length - 1 ? pagesOrdered[index + 1] : null,
    };
  }, [page, pagesOrdered]);

  const busy = runningOcr || runningAi || saving || rotating;

  const goToPage = useCallback(
    (target: BookPage | null) => {
      if (!id || !target || busy) return;
      router.replace(`/book/${id}/page/${target.id}`);
    },
    [busy, id, router]
  );

  const goPrev = useCallback(() => {
    goToPage(currentPos.prev);
  }, [currentPos.prev, goToPage]);

  const goNext = useCallback(() => {
    goToPage(currentPos.next);
  }, [currentPos.next, goToPage]);

  const swipeGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-28, 28])
        .failOffsetY([-20, 20])
        .onEnd((event) => {
          'worklet';
          const distance = event.translationX;
          const velocity = event.velocityX;
          if ((distance < -56 || velocity < -700) && distance < -24) {
            runOnJS(goNext)();
          } else if ((distance > 56 || velocity > 700) && distance > 24) {
            runOnJS(goPrev)();
          }
        }),
    [goNext, goPrev]
  );

  const applyPage = useCallback((data: Book, found: BookPage) => {
    setBook(data);
    setPage(found);
    setOcrText(found.ocrText);
    setAiText(found.aiText);
    setPrintedPageNumber(found.printedPageNumber ?? '');
    setTextTab(found.aiStatus === 'done' && found.aiText.trim() ? 'ai' : 'ocr');
  }, []);

  const refresh = useCallback(async () => {
    if (!id || !pageId) return;
    setLoading(true);
    try {
      let data = await getBook(id);
      let found = data.pages.find((p) => p.id === pageId) ?? null;
      if (!found) {
        throw new Error('Nie znaleziono strony.');
      }

      if (await isLandscapeUri(found.imageUri)) {
        await persistPortraitPageImage(id, pageId, found.imageUri);
        data = await getBook(id);
        found = data.pages.find((p) => p.id === pageId) ?? found;
      }

      applyPage(data, found);
    } catch (error) {
      Alert.alert('Błąd', error instanceof Error ? error.message : 'Nie udało się wczytać strony.');
      router.back();
    } finally {
      setLoading(false);
    }
  }, [applyPage, id, pageId, router]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const analyzingThisPage =
    ocrQueue.currentPageId === pageId || aiQueue.currentPageIds.includes(pageId);
  const wasAnalyzedRef = useRef(false);
  useEffect(() => {
    if (analyzingThisPage) {
      wasAnalyzedRef.current = true;
      return;
    }
    if (!wasAnalyzedRef.current) return;
    wasAnalyzedRef.current = false;
    void refresh();
  }, [analyzingThisPage, refresh]);

  const onSave = async () => {
    if (!id || !pageId) return;
    setSaving(true);
    try {
      const normalized = printedPageNumber.trim() || null;
      let updated = await updatePageOcr(id, pageId, {
        ocrText,
        printedPageNumber: normalized,
        ocrStatus: 'done',
        resetAi: false,
      });
      updated = await updatePageAi(id, pageId, {
        aiText,
        aiStatus: aiText.trim() ? 'done' : 'idle',
        aiError: null,
      });
      const found = updated.pages.find((p) => p.id === pageId) ?? null;
      if (found) applyPage(updated, found);
      Alert.alert('Zapisano', 'Tekst OCR i AI zostały zaktualizowane.');
    } catch (error) {
      Alert.alert('Błąd', error instanceof Error ? error.message : 'Nie udało się zapisać.');
    } finally {
      setSaving(false);
    }
  };

  const onRetryOcr = async () => {
    if (!id || !page) return;
    setRunningOcr(true);
    try {
      const recognized = await runPageOcrExclusive(id, page.id, page.imageUri);
      setOcrText(recognized);
      setAiText('');
      setTextTab('ocr');
      await refresh();
    } catch (error) {
      Alert.alert('OCR', error instanceof Error ? error.message : 'Rozpoznawanie nie powiodło się.');
      await refresh();
    } finally {
      setRunningOcr(false);
    }
  };

  const onRetryAi = async () => {
    if (!id || !page) return;
    if (!isApiConfigured()) {
      Alert.alert('AI', 'Brak EXPO_PUBLIC_API_BASE_URL w konfiguracji.');
      return;
    }
    if (!isLoggedIn) {
      Alert.alert('AI', 'Zaloguj się, aby uruchomić korektę AI.', [
        { text: 'Anuluj', style: 'cancel' },
        { text: 'Zaloguj', onPress: () => router.push('/login') },
      ]);
      return;
    }
    if (!ocrText.trim()) {
      Alert.alert('AI', 'Najpierw potrzebny jest tekst OCR.');
      return;
    }
    setRunningAi(true);
    try {
      const corrected = await runPageAiExclusive(id, page.id);
      setAiText(corrected);
      setTextTab('ai');
      await refresh();
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Korekta nie powiodła się.';
      if (error instanceof ApiError && error.status === 401) {
        Alert.alert('AI', message, [
          { text: 'Anuluj', style: 'cancel' },
          { text: 'Zaloguj', onPress: () => router.push('/login') },
        ]);
      } else {
        Alert.alert('AI', message);
      }
      await refresh();
    } finally {
      setRunningAi(false);
    }
  };

  const onRotate180 = async () => {
    if (!id || !page) return;
    setRotating(true);
    try {
      const { page: rotated } = await rotatePageImage180(id, page.id);
      setPage(rotated);
      setRunningOcr(true);
      const recognized = await runPageOcrExclusive(id, rotated.id, rotated.imageUri, {
        detectUpright: false,
      });
      setOcrText(recognized);
      setAiText('');
      setTextTab('ocr');
      await refresh();
    } catch (error) {
      Alert.alert('Obrót', error instanceof Error ? error.message : 'Nie udało się obrócić strony.');
      await refresh();
    } finally {
      setRotating(false);
      setRunningOcr(false);
    }
  };

  const onConfirmDelete = () => {
    if (!id || !page) return;
    setDeleteOpen(false);
    const target = page;
    void (async () => {
      cancelOcrForPage(target.id);
      cancelAiForPage(target.id);
      await deletePage(id, target.id);
      router.replace(`/book/${id}`);
    })();
  };

  if (loading || !page) {
    return <Loader label="Otwieram stronę…" />;
  }

  const position = currentPos.index >= 0 ? currentPos.index + 1 : 0;
  const editingAi = textTab === 'ai';

  return (
    <View style={styles.root}>
      <AppBar
        title={`Strona ${page.index}`}
        subtitle={`${position} z ${pagesOrdered.length}${
          page.printedPageNumber ? ` · w książce ${page.printedPageNumber}` : ''
        }`}
        right={
          <IconButton
            name="more"
            accessibilityLabel="Opcje strony"
            variant="outline"
            size={42}
            round
            onPress={() => setMenuOpen(true)}
          />
        }
      />

      <GestureDetector gesture={swipeGesture}>
        <View style={styles.flex}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              styles.content,
              { paddingBottom: 108 + Math.max(insets.bottom, space.md) },
            ]}>
            <ScanQueueCard />
            <AiQueueCard />

            <View style={styles.imageCard}>
              <Image source={{ uri: page.imageUri }} style={styles.image} key={page.imageUri} />

              <View style={styles.imageBadge}>
                <OcrStatusBadge status={runningOcr || rotating ? 'pending' : page.ocrStatus} />
                <AiStatusBadge
                  status={
                    runningAi || aiQueue.currentPageIds.includes(pageId) ? 'pending' : page.aiStatus
                  }
                />
              </View>

              {currentPos.prev ? (
                <NavArrow side="left" disabled={busy} onPress={goPrev} />
              ) : null}
              {currentPos.next ? (
                <NavArrow side="right" disabled={busy} onPress={goNext} />
              ) : null}

              <View style={styles.imageCounter}>
                <Icon name="notes" size={12} color={colors.white} />
                <Text style={styles.imageCounterText}>
                  {position} / {pagesOrdered.length}
                </Text>
              </View>
            </View>

            <TextField
              label="Numer wydrukowany na stronie"
              value={printedPageNumber}
              onChangeText={setPrintedPageNumber}
              placeholder="np. 12 albo xiv"
              icon="notes"
              hint="Numer z marginesu jest wykrywany automatycznie i usuwany z tekstu. Możesz go poprawić."
            />

            <View style={styles.tabRow}>
              <Pressable
                onPress={() => setTextTab('ai')}
                style={[styles.tab, editingAi && styles.tabActive]}>
                <Text style={[styles.tabLabel, editingAi && styles.tabLabelActive]}>Tekst AI</Text>
              </Pressable>
              <Pressable
                onPress={() => setTextTab('ocr')}
                style={[styles.tab, !editingAi && styles.tabActive]}>
                <Text style={[styles.tabLabel, !editingAi && styles.tabLabelActive]}>Tekst OCR</Text>
              </Pressable>
            </View>

            {page.aiStatus === 'error' && page.aiError ? (
              <Pressable
                onPress={() => Alert.alert('Błąd AI', page.aiError ?? 'Nieznany błąd')}
                style={styles.errorBox}>
                <Icon name="alert" size={16} color={colors.danger} />
                <Text style={styles.errorText} numberOfLines={4}>
                  {page.aiError}
                </Text>
              </Pressable>
            ) : null}

            {editingAi ? (
              <TextField
                label="Tekst po korekcie AI"
                value={aiText}
                onChangeText={setAiText}
                placeholder="Tu pojawi się tekst po korekcie AI…"
                multiline
                minHeight={240}
                hint="Obie wersje (OCR i AI) są przechowywane osobno."
              />
            ) : (
              <TextField
                label="Surowy tekst OCR"
                value={ocrText}
                onChangeText={setOcrText}
                placeholder="Tekst OCR pojawi się tutaj…"
                multiline
                minHeight={240}
                hint="Edycja OCR unieważnia korektę AI przy zapisie."
              />
            )}
          </ScrollView>
        </View>
      </GestureDetector>

      <View
        pointerEvents="box-none"
        style={[styles.dockWrap, { paddingBottom: Math.max(insets.bottom, space.md) }]}>
        <View style={styles.dock}>
          <IconButton
            name="ai"
            accessibilityLabel="Korekta AI"
            variant="soft"
            size={50}
            disabled={busy}
            onPress={() => void onRetryAi()}
          />
          <IconButton
            name="rotate"
            accessibilityLabel="Obróć 180 stopni"
            variant="soft"
            size={50}
            disabled={busy}
            onPress={() => void onRotate180()}
          />
          <Button
            label={saving ? 'Zapisywanie…' : 'Zapisz tekst'}
            icon="save"
            loading={saving}
            disabled={busy}
            onPress={() => void onSave()}
            style={styles.saveButton}
          />
        </View>
      </View>

      <Sheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        eyebrow="Strona"
        title={`Strona ${page.index}`}>
        <SheetGroup>
          <Row
            icon="gallery"
            label="Nowe zdjęcie"
            detail="Zrób zdjęcie tej strony jeszcze raz"
            disabled={busy}
            onPress={() => {
              setMenuOpen(false);
              router.push(`/book/${id}/capture?replacePageId=${page.id}`);
            }}
          />
          <View style={styles.sheetDivider} />
          <Row
            icon="ai"
            label="Korekta AI"
            detail="Popraw błędy OCR bez skracania tekstu"
            disabled={busy}
            onPress={() => {
              setMenuOpen(false);
              void onRetryAi();
            }}
          />
          <View style={styles.sheetDivider} />
          <Row
            icon="notes"
            label="Pion + OCR"
            detail="Wyprostuj i przeczytaj ponownie"
            disabled={busy}
            onPress={() => {
              setMenuOpen(false);
              void onRetryOcr();
            }}
          />
          <View style={styles.sheetDivider} />
          <Row
            icon="rotate"
            label="Obróć 180°"
            disabled={busy}
            onPress={() => {
              setMenuOpen(false);
              void onRotate180();
            }}
          />
        </SheetGroup>

        <SheetGroup>
          <Row
            icon="trash"
            label="Usuń stronę"
            tone="danger"
            disabled={busy}
            onPress={() => {
              setMenuOpen(false);
              setDeleteOpen(true);
            }}
          />
        </SheetGroup>
      </Sheet>

      <ConfirmDialog
        visible={deleteOpen}
        title="Usunąć stronę?"
        body={`Strona ${page.index} wraz ze zdjęciem i tekstem zostanie usunięta.`}
        confirmLabel="Usuń"
        onConfirm={onConfirmDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </View>
  );
}

function NavArrow({
  side,
  onPress,
  disabled,
}: {
  side: 'left' | 'right';
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={side === 'left' ? 'Poprzednia strona' : 'Następna strona'}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.navArrow,
        side === 'left' ? styles.navLeft : styles.navRight,
        pressed && styles.navPressed,
        disabled && styles.navDisabled,
      ]}>
      <Icon name={side === 'left' ? 'chevronLeft' : 'chevronRight'} size={20} color={colors.white} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: space.lg,
    gap: space.lg,
  },
  imageCard: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: radius.xl,
    backgroundColor: colors.surfaceSunken,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.line,
    ...shadow.soft,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imageBadge: {
    position: 'absolute',
    top: space.md,
    right: space.md,
    gap: space.xs,
    alignItems: 'flex-end',
  },
  imageCounter: {
    position: 'absolute',
    bottom: space.md,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(10, 12, 20, 0.62)',
  },
  imageCounterText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  tabRow: {
    flexDirection: 'row',
    gap: space.sm,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    padding: 4,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  tabActive: {
    backgroundColor: colors.surface,
    ...shadow.soft,
  },
  tabLabel: {
    fontSize: 13.5,
    fontWeight: '700',
    color: colors.muted,
  },
  tabLabelActive: {
    color: colors.ink,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: colors.danger,
  },
  navArrow: {
    position: 'absolute',
    top: '46%',
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(10, 12, 20, 0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  navLeft: {
    left: space.md,
  },
  navRight: {
    right: space.md,
  },
  navPressed: {
    backgroundColor: 'rgba(10, 12, 20, 0.72)',
    transform: [{ scale: 0.94 }],
  },
  navDisabled: {
    opacity: 0.35,
  },
  dockWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space.lg,
  },
  dock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.sm,
    borderRadius: radius.xl,
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.hairline,
    ...shadow.float,
  },
  saveButton: {
    flex: 1,
  },
  sheetDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
    marginLeft: space.lg + 36 + space.md,
  },
});
