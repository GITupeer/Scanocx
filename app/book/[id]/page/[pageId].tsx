import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';

import { isApiConfigured } from '@/src/ai/config';
import { estimateGeminiRequestCost, formatUsd } from '@/src/ai/pricing';
import {
  cancelAiForPage,
  AiQuotaExceededError,
  runPageAiExclusive,
  useAiQueue,
} from '@/src/ai/queue';
import { useAuth } from '@/src/auth/AuthProvider';
import type { AiAnalysis, Book, BookPage } from '@/src/domain/types';
import { isLandscapeUri } from '@/src/images/ensurePortrait';
import { getLibraryBook } from '@/src/library/books';
import { cancelOcrForPage, runPageOcrExclusive, useOcrQueue } from '@/src/ocr/queue';
import { OcrAuthRequiredError, OcrQuotaExceededError } from '@/src/ocr/quota';
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
  Dialog,
  Icon,
  IconButton,
  Loader,
  OcrStatusBadge,
  PageImagePlaceholder,
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
type ImagePreview = 'cropped' | 'original';

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) {
    const kb = bytes / 1024;
    return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  }
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(2) : mb.toFixed(1)} MB`;
}

function formatScore(value: number): string {
  return value.toFixed(2);
}

function formatTokenCount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return 'Brak danych';
  return Math.round(value).toLocaleString('pl-PL');
}

export default function PageDetailScreen() {
  const { id, pageId } = useLocalSearchParams<{ id: string; pageId: string }>();
  const router = useRouter();
  const { ready, isLoggedIn } = useAuth();
  const insets = useSafeAreaInsets();
  const [book, setBook] = useState<Book | null>(null);
  const [page, setPage] = useState<BookPage | null>(null);
  const [ocrText, setOcrText] = useState('');
  const [aiText, setAiText] = useState('');
  const [printedPageNumber, setPrintedPageNumber] = useState('');
  const [textTab, setTextTab] = useState<TextTab>('ai');
  const [imagePreview, setImagePreview] = useState<ImagePreview>('cropped');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [runningOcr, setRunningOcr] = useState(false);
  const [runningAi, setRunningAi] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [imageSizeLabel, setImageSizeLabel] = useState<string | null>(null);
  const ocrQueue = useOcrQueue();
  const aiQueue = useAiQueue();

  const pagesOrdered = useMemo(() => {
    if (!book) return [];
    return [...book.pages].sort((a, b) => a.index - b.index);
  }, [book]);

  useEffect(() => {
    if (!ready) return;
    if (!isLoggedIn) {
      router.replace('/login');
    }
  }, [ready, isLoggedIn, router]);

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
    setImagePreview('cropped');
  }, []);

  const refresh = useCallback(async () => {
    if (!id || !pageId || !isLoggedIn) return;
    setLoading(true);
    try {
      let data = await getLibraryBook(id);
      let found = data.pages.find((p) => p.id === pageId) ?? null;
      if (!found) {
        throw new Error('Nie znaleziono strony.');
      }

      if (found.imageUri && (await isLandscapeUri(found.imageUri))) {
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
  }, [applyPage, id, isLoggedIn, pageId, router]);

  useEffect(() => {
    if (!isLoggedIn) return;
    void refresh();
  }, [isLoggedIn, refresh]);

  useEffect(() => {
    const uri =
      imagePreview === 'original' && page?.originalImageUri?.trim()
        ? page.originalImageUri
        : page?.imageUri;
    if (!uri) {
      setImageSizeLabel(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const info = await FileSystem.getInfoAsync(uri);
        if (cancelled) return;
        if (info.exists && 'size' in info && typeof info.size === 'number') {
          setImageSizeLabel(formatBytes(info.size));
        } else {
          setImageSizeLabel(null);
        }
      } catch {
        if (!cancelled) setImageSizeLabel(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [imagePreview, page?.imageUri, page?.originalImageUri]);

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
      Alert.alert('Zapisano', 'Tekst ze skanu i tekst AI zostały zaktualizowane.');
    } catch (error) {
      Alert.alert('Błąd', error instanceof Error ? error.message : 'Nie udało się zapisać.');
    } finally {
      setSaving(false);
    }
  };

  const onRetryOcr = async () => {
    if (!id || !page) return;
    if (page.aiOnly) {
      Alert.alert(
        'Odczyt tekstu',
        'Ta strona to skan wielu stron — użyj Analizy AI zamiast zwykłego OCR.',
      );
      return;
    }
    if (!isLoggedIn) {
      router.push('/login');
      return;
    }
    if (!page.imageUri?.trim()) {
      Alert.alert('Odczyt tekstu', 'Brak lokalnego zdjęcia tej strony.');
      return;
    }
    setRunningOcr(true);
    try {
      const recognized = await runPageOcrExclusive(id, page.id, page.imageUri);
      setOcrText(recognized);
      setAiText('');
      setTextTab('ocr');
      await refresh();
    } catch (error) {
      Alert.alert(
        'Odczyt tekstu',
        error instanceof OcrAuthRequiredError || error instanceof OcrQuotaExceededError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Odczytywanie tekstu nie powiodło się.',
      );
      await refresh();
    } finally {
      setRunningOcr(false);
    }
  };

  const onRetryAi = async () => {
    if (!id || !page) return;
    if (!isApiConfigured()) {
      Alert.alert('AI', 'Brak adresu API. Ustaw EXPO_PUBLIC_API_BASE_URL.');
      return;
    }
    if (!isLoggedIn) {
      router.push('/login');
      return;
    }
    if (!page.imageUri?.trim()) {
      Alert.alert('AI', 'Brak zdjęcia strony do analizy.');
      return;
    }
    setRunningAi(true);
    try {
      const corrected = await runPageAiExclusive(id, page.id);
      setAiText(corrected);
      setTextTab('ai');
      await refresh();
    } catch (error) {
      if (error instanceof AiQuotaExceededError) {
        router.push('/subscribe');
        return;
      }
      Alert.alert(
        'Analiza i Korekta AI',
        error instanceof Error ? error.message : 'Korekta AI nie powiodła się.'
      );
      await refresh();
    } finally {
      setRunningAi(false);
    }
  };

  const onRotate180 = async () => {
    if (!id || !page) return;
    if (!page.imageUri?.trim()) {
      Alert.alert('Obrót', 'Brak lokalnego zdjęcia tej strony.');
      return;
    }
    setRotating(true);
    try {
      const { page: rotated } = await rotatePageImage180(id, page.id);
      setPage(rotated);
      if (!isLoggedIn) {
        Alert.alert('Obrócono', 'Zdjęcie obrócone. Zaloguj się, aby odczytać tekst OCR.');
        await refresh();
        return;
      }
      if (!rotated.imageUri?.trim()) {
        await refresh();
        return;
      }
      setRunningOcr(true);
      try {
        const recognized = await runPageOcrExclusive(id, rotated.id, rotated.imageUri, {
          detectUpright: false,
        });
        setOcrText(recognized);
        setAiText('');
        setTextTab('ocr');
      } catch (error) {
        if (error instanceof OcrQuotaExceededError || error instanceof OcrAuthRequiredError) {
          Alert.alert('Obrócono', error.message);
          await refresh();
          return;
        }
        throw error;
      }
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
  const hasOriginal = Boolean(page.originalImageUri?.trim());
  const previewUri =
    imagePreview === 'original' && hasOriginal
      ? page.originalImageUri
      : page.imageUri;
  const showingOriginal = imagePreview === 'original' && hasOriginal;
  const aiCost = page.aiAnalysis
    ? estimateGeminiRequestCost({
        promptTokens: page.aiAnalysis.promptTokens,
        outputTokens: page.aiAnalysis.outputTokens,
        totalTokens: page.aiAnalysis.totalTokens,
      })
    : null;

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

            {hasOriginal ? (
              <View style={styles.previewTabRow}>
                <Pressable
                  onPress={() => setImagePreview('cropped')}
                  style={[styles.previewTab, !showingOriginal && styles.previewTabActive]}>
                  <Text
                    style={[
                      styles.previewTabLabel,
                      !showingOriginal && styles.previewTabLabelActive,
                    ]}>
                    Kadr
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setImagePreview('original')}
                  style={[styles.previewTab, showingOriginal && styles.previewTabActive]}>
                  <Text
                    style={[
                      styles.previewTabLabel,
                      showingOriginal && styles.previewTabLabelActive,
                    ]}>
                    Oryginał
                  </Text>
                </Pressable>
              </View>
            ) : null}

            <View style={styles.imageCard}>
              {previewUri ? (
                <Image
                  source={{ uri: previewUri }}
                  style={styles.image}
                  key={`${previewUri}-${showingOriginal ? 'orig' : 'crop'}`}
                />
              ) : (
                <PageImagePlaceholder style={styles.image} />
              )}

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
                  {imageSizeLabel ? ` · ${imageSizeLabel}` : ''}
                  {showingOriginal ? ' · oryginał' : ''}
                </Text>
              </View>
            </View>

            {page.aiAnalysis &&
            (page.aiAnalysis.promptTokens != null ||
              page.aiAnalysis.outputTokens != null ||
              page.aiAnalysis.totalTokens != null) ? (
              <View style={styles.usageBlock}>
                <View style={styles.tokenRow}>
                  <Icon name="ai" size={14} color={colors.muted} />
                  <Text style={styles.tokenText}>
                    Ostatnia korekta AI ·{' '}
                    {page.aiAnalysis.promptTokens != null
                      ? `${formatTokenCount(page.aiAnalysis.promptTokens)} in`
                      : '— in'}
                    {' · '}
                    {page.aiAnalysis.outputTokens != null
                      ? `${formatTokenCount(page.aiAnalysis.outputTokens)} out`
                      : '— out'}
                    {page.aiAnalysis.totalTokens != null
                      ? ` · ${formatTokenCount(page.aiAnalysis.totalTokens)} łącznie`
                      : ''}
                  </Text>
                </View>
                {aiCost ? (
                  <Text style={styles.costText}>
                    Koszt · wejście {formatUsd(aiCost.inputUsd)} · wyjście{' '}
                    {formatUsd(aiCost.outputUsd)} · łącznie {formatUsd(aiCost.totalUsd)}
                  </Text>
                ) : null}
              </View>
            ) : null}

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
                <Text style={[styles.tabLabel, !editingAi && styles.tabLabelActive]}>Tekst ze skanu</Text>
              </Pressable>
            </View>

            {page.aiStatus === 'error' && page.aiError ? (
              <View style={styles.errorBox}>
                <Icon name="alert" size={16} color={colors.danger} />
                <Text style={styles.errorText} numberOfLines={4}>
                  {page.aiError}
                </Text>
              </View>
            ) : null}

            {editingAi ? (
              <TextField
                label="Tekst po korekcie AI"
                value={aiText}
                onChangeText={setAiText}
                placeholder="Tu pojawi się tekst po korekcie AI…"
                multiline
                minHeight={240}
                hint="Obie wersje (ze skanu i po AI) są przechowywane osobno."
              />
            ) : (
              <TextField
                label="Tekst ze skanu"
                value={ocrText}
                onChangeText={setOcrText}
                placeholder="Odczytany tekst pojawi się tutaj…"
                multiline
                minHeight={240}
                hint="Edycja tekstu ze skanu unieważnia korektę AI przy zapisie."
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
            accessibilityLabel="Analiza i Korekta AI"
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
            icon="frame"
            label="Dopasuj rogi"
            detail={
              page.aiOnly
                ? 'Niedostępne dla skanu wielu stron'
                : 'Ręcznie ustaw kadr i odczytaj tekst ponownie'
            }
            disabled={busy || !!page.aiOnly}
            onPress={() => {
              setMenuOpen(false);
              router.push(`/book/${id}/crop?pageId=${page.id}`);
            }}
          />
          <View style={styles.sheetDivider} />
          <Row
            icon="ai"
            label="Analiza i Korekta AI"
            detail="Popraw literówki i błędy odczytu bez skracania tekstu"
            disabled={busy}
            onPress={() => {
              setMenuOpen(false);
              void onRetryAi();
            }}
          />
          {!page.aiOnly ? (
            <>
              <View style={styles.sheetDivider} />
              <Row
                icon="notes"
                label={page.ocrStatus === 'idle' ? 'Odczytaj tekst' : 'Pion + odczyt'}
                detail={
                  page.ocrStatus === 'idle'
                    ? 'Uruchom OCR dla tego zdjęcia'
                    : 'Wyprostuj stronę i odczytaj tekst ponownie'
                }
                disabled={busy}
                onPress={() => {
                  setMenuOpen(false);
                  void onRetryOcr();
                }}
              />
            </>
          ) : null}
          <View style={styles.sheetDivider} />
          <Row
            icon="stats"
            label="Analiza AI"
            detail={
              page.aiAnalysis
                ? 'Tytuł, jakość OCR i numer strony'
                : page.aiStatus === 'done'
                  ? 'Brak metadanych — uruchom korektę ponownie'
                  : 'Dostępna po udanej korekcie AI'
            }
            disabled={!page.aiAnalysis}
            onPress={() => {
              setMenuOpen(false);
              setAnalysisOpen(true);
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

      <AiAnalysisDialog
        visible={analysisOpen}
        analysis={page.aiAnalysis}
        onClose={() => setAnalysisOpen(false)}
      />

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

function AiAnalysisDialog({
  visible,
  analysis,
  onClose,
}: {
  visible: boolean;
  analysis: AiAnalysis | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      visible={visible}
      onClose={onClose}
      icon="stats"
      title="Analiza AI"
      body="Wynik ostatniej korekty Gemini dla tej strony."
      actions={<Button label="Zamknij" variant="outline" onPress={onClose} style={{ flex: 1 }} />}>
      {analysis ? (
        <View style={styles.analysisList}>
          <AnalysisRow
            label="Tytuł"
            value={analysis.title ?? 'Nie wykryto'}
            muted={!analysis.title}
          />
          <AnalysisRow
            label="Podtytuł"
            value={analysis.subtitle ?? 'Nie wykryto'}
            muted={!analysis.subtitle}
          />
          <AnalysisRow label="Jakość OCR" value={formatScore(analysis.ocrQuality)} />
          <AnalysisRow label="Spójność po korekcie" value={formatScore(analysis.coherence)} />
          <AnalysisRow
            label="Numer strony"
            value={
              analysis.pageNumber
                ? `${analysis.pageNumber} (usunięty z tekstu)`
                : 'Nie wykryto'
            }
            muted={!analysis.pageNumber}
          />
          <AnalysisRow
            label="Tokeny wejściowe"
            value={formatTokenCount(analysis.promptTokens)}
            muted={analysis.promptTokens == null}
          />
          <AnalysisRow
            label="Tokeny wyjściowe"
            value={formatTokenCount(analysis.outputTokens)}
            muted={analysis.outputTokens == null}
          />
          <AnalysisRow
            label="Tokeny łącznie"
            value={formatTokenCount(analysis.totalTokens)}
            muted={analysis.totalTokens == null}
          />
        </View>
      ) : null}
    </Dialog>
  );
}

function AnalysisRow({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <View style={styles.analysisRow}>
      <Text style={styles.analysisLabel}>{label}</Text>
      <Text style={[styles.analysisValue, muted && styles.analysisMuted]}>{value}</Text>
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
  previewTabRow: {
    flexDirection: 'row',
    gap: space.sm,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    padding: 4,
  },
  previewTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  previewTabActive: {
    backgroundColor: colors.surface,
    ...shadow.soft,
  },
  previewTabLabel: {
    fontSize: 13.5,
    fontWeight: '700',
    color: colors.muted,
  },
  previewTabLabelActive: {
    color: colors.ink,
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
  tokenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  usageBlock: {
    gap: 4,
    marginTop: -space.sm,
  },
  tokenText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: '600',
    color: colors.muted,
    fontVariant: ['tabular-nums'],
  },
  costText: {
    marginLeft: 14 + space.sm,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    color: colors.faint,
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
  analysisList: {
    gap: space.md,
    paddingVertical: space.xs,
  },
  analysisRow: {
    gap: 4,
  },
  analysisLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  analysisValue: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.ink,
    lineHeight: 21,
  },
  analysisMuted: {
    color: colors.faint,
    fontWeight: '500',
  },
});
