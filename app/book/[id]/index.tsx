import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isApiConfigured } from '@/src/ai/config';
import { getDisplayText, needsAiRewrite, needsManualReview } from '@/src/ai/displayText';
import {
  cancelAiForBook,
  cancelAiForPage,
  clearAiQuotaErrorsForBook,
  enqueuePendingAiForBook,
  resumePendingCloudAi,
  useAiQueue,
} from '@/src/ai/queue';
import { useAuth } from '@/src/auth/AuthProvider';
import type { AiAnalysis, Book, BookPage } from '@/src/domain/types';
import {
  cancelOcrForBook,
  cancelOcrForPage,
  enqueueOcrJobs,
  runPageOcrExclusive,
  tryResumeOcrQueue,
  useOcrQueue,
} from '@/src/ocr/queue';
import {
  formatConfidenceQualityLabel,
} from '@/src/ocr/quality';
import {
  getOcrRemaining,
  OcrAuthRequiredError,
  OcrQuotaExceededError,
  useOcrQuota,
} from '@/src/ocr/quota';
import {
  clearBookCover,
  deleteBook,
  deletePage,
  getBook,
  renameBook,
  rotatePageImage180,
  setBookCover,
} from '@/src/storage/books';
import {
  AiLimitPromoCard,
  AiPromoCard,
  AiQueueCard,
  AiStatusBadge,
  AppBar,
  BusyOverlay,
  Button,
  OcrPromoCard,
  ConfirmDialog,
  Dialog,
  EmptyState,
  Gradient,
  Icon,
  Loader,
  OcrStatusBadge,
  Row,
  ScanQueueCard,
  SegmentedControl,
  Sheet,
  SheetGroup,
  TextField,
  colors,
  font,
  gradients,
  radius,
  shadow,
  space,
} from '@/src/ui';
import { pages as pagesLabel } from '@/src/utils/format';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_WIDTH = SCREEN_WIDTH - space.lg * 2;
const IMAGE_HEIGHT = Math.round(CARD_WIDTH * (4 / 3));
const DOCK_HEIGHT = 64;
const DOCK_FAB_SIZE = 48;
const DOCK_BOTTOM_GAP = space.sm;
const GRID_GAP = space.md;
const GRID_COLUMNS = 2;
const GRID_ITEM_WIDTH = (CARD_WIDTH - GRID_GAP) / GRID_COLUMNS;
const GRID_IMAGE_HEIGHT = Math.round(GRID_ITEM_WIDTH * (4 / 3));
const LIST_THUMB = 72;

type ViewMode = 'cards' | 'grid' | 'list';
type PageFilter = 'all' | 'manual';

const VIEW_MODES = [
  { id: 'cards', label: 'Obecny' },
  { id: 'grid', label: 'Grid' },
  { id: 'list', label: 'Lista' },
] as const satisfies readonly { id: ViewMode; label: string }[];

const PAGE_FILTERS = [
  { id: 'all', label: 'Wszystkie' },
  { id: 'manual', label: 'Niska jakość skanu' },
] as const satisfies readonly { id: PageFilter; label: string }[];

function ocrOverlayCopy(page: BookPage): string {
  if (page.ocrStatus === 'pending') return 'Odczytywanie tekstu…';
  if (page.ocrStatus === 'idle') {
    return 'Zdjęcie zapisane — zaloguj się i uruchom odczyt tekstu.';
  }
  if (page.aiStatus === 'pending') return 'Korekta AI w toku…';
  if (page.aiStatus === 'error') {
    return page.aiError?.trim() || 'Błąd korekty AI.';
  }
  if (page.ocrStatus === 'error') return 'Nie udało się odczytać tekstu z tej strony.';
  const text = getDisplayText(page).trim();
  return text.length > 0 ? text : 'Brak rozpoznanego tekstu.';
}

function OcrQualityChips({ page }: { page: BookPage }) {
  if (page.ocrStatus !== 'done' || !page.ocrQuality) return null;

  const { confidence } = page.ocrQuality;
  const confidenceTone = !confidence.available
    ? 'neutral'
    : confidence.weak
      ? 'warn'
      : 'ok';

  return (
    <View style={styles.qualityRow}>
      <View
        style={[
          styles.qualityChip,
          confidenceTone === 'warn'
            ? styles.qualityChipWarn
            : confidenceTone === 'ok'
              ? styles.qualityChipOk
              : styles.qualityChipNeutral,
        ]}>
        <Text
          style={[
            styles.qualityChipText,
            confidenceTone === 'warn'
              ? styles.qualityChipTextWarn
              : confidenceTone === 'ok'
                ? styles.qualityChipTextOk
                : styles.qualityChipTextNeutral,
          ]}>
          {formatConfidenceQualityLabel(confidence)}
        </Text>
      </View>
    </View>
  );
}

export default function BookDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isLoggedIn, user, refresh: refreshAuth } = useAuth();
  const [book, setBook] = useState<Book | null>(null);
  const [loading, setLoading] = useState(true);
  const [showOcr, setShowOcr] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [pageFilter, setPageFilter] = useState<PageFilter>('all');
  const [menuPage, setMenuPage] = useState<BookPage | null>(null);
  const [analysisTarget, setAnalysisTarget] = useState<BookPage | null>(null);
  const [bookMenu, setBookMenu] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTitle, setRenameTitle] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [deleteBookOpen, setDeleteBookOpen] = useState(false);
  const [deletePageTarget, setDeletePageTarget] = useState<BookPage | null>(null);
  const ocrQueue = useOcrQueue();
  const ocrQuota = useOcrQuota();
  const aiQueue = useAiQueue();

  const refresh = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await getBook(id);
      setBook(data);
    } catch (error) {
      Alert.alert('Błąd', error instanceof Error ? error.message : 'Nie znaleziono książki.');
      router.replace('/');
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
      if (isLoggedIn) void refreshAuth();
    }, [isLoggedIn, refresh, refreshAuth])
  );

  // Każda strona zamknięta przez kolejkę zmienia meta.json — przeczytaj je ponownie,
  // żeby plakietki i tekst OCR/AI aktualizowały się na żywo.
  const lastOcrCompletedRef = useRef(ocrQueue.completed);
  const lastAiCompletedRef = useRef(aiQueue.completed);
  useEffect(() => {
    if (
      ocrQueue.completed === lastOcrCompletedRef.current &&
      aiQueue.completed === lastAiCompletedRef.current
    ) {
      return;
    }
    lastOcrCompletedRef.current = ocrQueue.completed;
    lastAiCompletedRef.current = aiQueue.completed;
    void refresh();
    if (aiQueue.completed > 0) {
      void refreshAuth();
    }
  }, [aiQueue.completed, ocrQueue.completed, refresh, refreshAuth]);

  // Strony, których analiza nie zdążyła się wykonać (np. apka zamknięta w trakcie),
  // wracają do kolejki — tylko dla zalogowanych, w limicie OCR. Duplikaty odrzuca kolejka.
  useEffect(() => {
    if (!book || actionBusy || !isLoggedIn) return;
    const unprocessed = book.pages.filter((page) => page.ocrStatus === 'pending');
    if (unprocessed.length === 0) {
      void tryResumeOcrQueue();
      return;
    }

    void (async () => {
      const remaining = await getOcrRemaining();
      const jobs = unprocessed.map((page) => ({
        bookId: book.id,
        pageId: page.id,
        pageIndex: page.index,
        imageUri: page.imageUri,
      }));
      const allowed = remaining == null ? jobs : jobs.slice(0, remaining);
      if (allowed.length > 0) {
        enqueueOcrJobs(allowed);
      }
      await tryResumeOcrQueue();
    })();
  }, [actionBusy, book, isLoggedIn]);

  // Korekta AI jest w chmurze — po restarcie wznów polling, jeśli strony nadal czekają.
  useEffect(() => {
    if (!book || actionBusy || !isLoggedIn) return;
    const pendingAi = book.pages.some((page) => page.aiStatus === 'pending');
    if (!pendingAi) return;
    void resumePendingCloudAi(book.id);
  }, [actionBusy, book, isLoggedIn]);

  // Stare „Przekroczono limit AI” na stronach → idle (bez błędu, promo card u góry).
  useEffect(() => {
    if (!book || !isLoggedIn || !id) return;
    void clearAiQuotaErrorsForBook(book.id).then(async (changed) => {
      if (!changed) return;
      try {
        setBook(await getBook(id));
      } catch {
        // ignore
      }
    });
  }, [book?.id, id, isLoggedIn]);

  const pagesNewestFirst = useMemo(() => {
    if (!book) return [];
    return [...book.pages].sort((a, b) => {
      const byDate = b.createdAt.localeCompare(a.createdAt);
      if (byDate !== 0) return byDate;
      return b.index - a.index;
    });
  }, [book]);

  const manualReviewCount = useMemo(
    () => pagesNewestFirst.filter(needsManualReview).length,
    [pagesNewestFirst]
  );

  const visiblePages = useMemo(() => {
    if (pageFilter !== 'manual') return pagesNewestFirst;
    return pagesNewestFirst.filter(needsManualReview);
  }, [pageFilter, pagesNewestFirst]);

  useEffect(() => {
    if (pageFilter === 'manual' && manualReviewCount === 0) {
      setPageFilter('all');
    }
  }, [manualReviewCount, pageFilter]);

  const doneCount = useMemo(
    () => (book ? book.pages.filter((page) => page.ocrStatus === 'done').length : 0),
    [book]
  );

  /** Zdjęcia bez OCR (idle / błąd) — czekają na odczyt. */
  const ocrPendingCount = useMemo(
    () =>
      book
        ? book.pages.filter(
            (page) => page.ocrStatus === 'idle' || page.ocrStatus === 'error'
          ).length
        : 0,
    [book]
  );

  const showOcrPromo =
    isLoggedIn &&
    ocrPendingCount > 0 &&
    ocrQueue.total === 0 &&
    (ocrQuota.unlimited || (ocrQuota.remaining ?? 0) > 0);

  const aiPendingCount = useMemo(
    () => (book ? book.pages.filter(needsAiRewrite).length : 0),
    [book]
  );

  const aiRemaining = user?.quota?.remaining ?? null;
  const showAiLimitPromo =
    isLoggedIn &&
    aiPendingCount > 0 &&
    aiQueue.total === 0 &&
    aiRemaining != null &&
    aiRemaining <= 0;

  const onRunBookOcr = useCallback(() => {
    if (!book) return;
    if (!isLoggedIn) {
      router.push('/login');
      return;
    }
    const waiting = book.pages.filter(
      (page) => page.ocrStatus === 'idle' || page.ocrStatus === 'error'
    );
    if (waiting.length === 0) return;

    void (async () => {
      const remaining = await getOcrRemaining();
      const slice =
        remaining == null ? waiting : waiting.slice(0, Math.max(0, remaining));
      if (slice.length === 0) {
        Alert.alert(
          'Limit OCR',
          'Brak dostępnych odczytów w tym miesiącu. Zdjęcia możesz dalej robić — przejdź na Pro, aby mieć nielimitowane OCR.'
        );
        return;
      }
      enqueueOcrJobs(
        slice.map((page) => ({
          bookId: book.id,
          pageId: page.id,
          pageIndex: page.index,
          imageUri: page.imageUri,
        }))
      );
    })();
  }, [book, isLoggedIn, router]);

  const onRunBookAi = useCallback(() => {
    if (!book) return;
    if (!isApiConfigured()) return;
    if (!isLoggedIn) {
      router.push('/login');
      return;
    }
    const waiting = book.pages.filter(needsAiRewrite).length;
    if (waiting === 0) return;
    void enqueuePendingAiForBook(book.id)
      .then(async () => {
        await refreshAuth();
        await refresh();
      })
      .catch(() => {
        // Status błędów widać w AiQueueCard / badge’ach stron.
      });
  }, [book, isLoggedIn, refresh, refreshAuth, router]);

  const openPageMenu = useCallback(
    (page: BookPage) => {
      if (actionBusy) return;
      setMenuPage(page);
    },
    [actionBusy]
  );

  const closePageMenu = useCallback(() => {
    setMenuPage(null);
  }, []);

  const onEditPage = useCallback(() => {
    if (!book || !menuPage) return;
    const pageId = menuPage.id;
    closePageMenu();
    router.push(`/book/${book.id}/page/${pageId}`);
  }, [book, closePageMenu, menuPage, router]);

  const onReplacePhoto = useCallback(() => {
    if (!book || !menuPage) return;
    const pageId = menuPage.id;
    closePageMenu();
    router.push(`/book/${book.id}/capture?replacePageId=${pageId}`);
  }, [book, closePageMenu, menuPage, router]);

  const onRetryOcr = useCallback(() => {
    if (!book || !menuPage) return;
    if (!isLoggedIn) {
      closePageMenu();
      router.push('/login');
      return;
    }
    const page = menuPage;
    closePageMenu();
    setActionBusy(true);
    void (async () => {
      try {
        await runPageOcrExclusive(book.id, page.id, page.imageUri);
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
        setActionBusy(false);
      }
    })();
  }, [book, closePageMenu, isLoggedIn, menuPage, refresh, router]);

  const onRotate180 = useCallback(() => {
    if (!book || !menuPage) return;
    const page = menuPage;
    closePageMenu();
    setActionBusy(true);
    void (async () => {
      try {
        const { page: rotated } = await rotatePageImage180(book.id, page.id);
        if (!isLoggedIn) {
          Alert.alert(
            'Obrócono',
            'Zdjęcie obrócone. Zaloguj się, aby odczytać tekst OCR.'
          );
          await refresh();
          return;
        }
        try {
          await runPageOcrExclusive(book.id, rotated.id, rotated.imageUri, { detectUpright: false });
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
        setActionBusy(false);
      }
    })();
  }, [book, closePageMenu, isLoggedIn, menuPage, refresh]);

  const onConfirmDeletePage = useCallback(() => {
    const page = deletePageTarget;
    if (!book || !page) return;
    setDeletePageTarget(null);
    void (async () => {
      setActionBusy(true);
      try {
        cancelOcrForPage(page.id);
        cancelAiForPage(page.id);
        await deletePage(book.id, page.id);
        await refresh();
      } catch (error) {
        Alert.alert('Błąd', error instanceof Error ? error.message : 'Nie udało się usunąć strony.');
      } finally {
        setActionBusy(false);
      }
    })();
  }, [book, deletePageTarget, refresh]);

  const onConfirmDeleteBook = useCallback(() => {
    if (!book) return;
    setDeleteBookOpen(false);
    void (async () => {
      cancelOcrForBook(book.id);
      cancelAiForBook(book.id);
      await deleteBook(book.id);
      router.replace('/');
    })();
  }, [book, router]);

  const openRename = useCallback(() => {
    if (!book) return;
    setBookMenu(false);
    setRenameTitle(book.title);
    setRenameOpen(true);
  }, [book]);

  const onRename = useCallback(() => {
    if (!book) return;
    setRenaming(true);
    void (async () => {
      try {
        const updated = await renameBook(book.id, renameTitle);
        setBook(updated);
        setRenameOpen(false);
      } catch (error) {
        Alert.alert(
          'Nazwa',
          error instanceof Error ? error.message : 'Nie udało się zmienić nazwy.'
        );
      } finally {
        setRenaming(false);
      }
    })();
  }, [book, renameTitle]);

  const onPickCover = useCallback(() => {
    if (!book) return;
    setBookMenu(false);
    void (async () => {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.9,
        allowsEditing: true,
        aspect: [3, 4],
      });
      if (result.canceled || !result.assets[0]?.uri) return;

      setActionBusy(true);
      try {
        const updated = await setBookCover(book.id, result.assets[0].uri);
        setBook(updated);
      } catch (error) {
        Alert.alert(
          'Okładka',
          error instanceof Error ? error.message : 'Nie udało się ustawić okładki.'
        );
      } finally {
        setActionBusy(false);
      }
    })();
  }, [book]);

  const onClearCover = useCallback(() => {
    if (!book) return;
    setBookMenu(false);
    void (async () => {
      setActionBusy(true);
      try {
        const updated = await clearBookCover(book.id);
        setBook(updated);
      } catch (error) {
        Alert.alert(
          'Okładka',
          error instanceof Error ? error.message : 'Nie udało się usunąć okładki.'
        );
      } finally {
        setActionBusy(false);
      }
    })();
  }, [book]);

  const renderCardsPage = useCallback(
    ({ item }: { item: BookPage }) => (
      <View style={styles.pageCard}>
        <Pressable
          style={({ pressed }) => [styles.pageHeader, pressed && styles.pageHeaderPressed]}
          onPress={() => openPageMenu(item)}>
          <Gradient colors={gradients.brand} style={styles.pageIndex}>
            <Text style={styles.pageIndexText}>{item.index}</Text>
          </Gradient>

          <View style={styles.pageHeaderText}>
            <Text style={styles.pageTitle}>Strona {item.index}</Text>
            {item.printedPageNumber ? (
              <Text style={styles.pageSubtitle}>w książce: {item.printedPageNumber}</Text>
            ) : null}
            {needsManualReview(item) ? (
              <Text style={styles.reviewFlag}>Niska jakość skanu</Text>
            ) : null}
          </View>

          <View style={styles.pageBadges}>
            <OcrStatusBadge status={item.ocrStatus} />
            <AiStatusBadge status={item.aiStatus} />
          </View>
          <Icon name="more" size={18} color={colors.faint} />
        </Pressable>

        <OcrQualityChips page={item} />

        <View style={styles.imageFrame}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => openPageMenu(item)}
            disabled={showOcr || actionBusy}>
            <Image source={{ uri: item.imageUri }} style={styles.image} resizeMode="contain" />
          </Pressable>

          {showOcr ? (
            <View style={styles.ocrOverlay}>
              <View style={styles.ocrChip}>
                <Icon name="ai" size={12} color={colors.white} />
                <Text style={styles.ocrChipText}>
                  {item.aiStatus === 'error'
                    ? 'Błąd AI'
                    : item.aiStatus === 'done'
                      ? 'Tekst AI'
                      : 'Tekst ze skanu'}
                </Text>
              </View>
              <ScrollView
                style={styles.ocrScroll}
                contentContainerStyle={styles.ocrScrollContent}
                showsVerticalScrollIndicator
                nestedScrollEnabled
                bounces={false}>
                <Text style={styles.ocrText}>{ocrOverlayCopy(item)}</Text>
              </ScrollView>
            </View>
          ) : null}
        </View>
      </View>
    ),
    [actionBusy, openPageMenu, showOcr]
  );

  const renderGridPage = useCallback(
    ({ item }: { item: BookPage }) => (
      <Pressable
        style={({ pressed }) => [styles.gridCard, pressed && styles.pageHeaderPressed]}
        onPress={() => openPageMenu(item)}
        disabled={actionBusy}>
        <View style={styles.gridImageFrame}>
          <Image source={{ uri: item.imageUri }} style={styles.image} resizeMode="cover" />
          <Gradient colors={gradients.brand} style={styles.gridIndex}>
            <Text style={styles.gridIndexText}>{item.index}</Text>
          </Gradient>
        </View>
        <View style={styles.gridMeta}>
          <Text style={styles.gridTitle} numberOfLines={1}>
            Strona {item.index}
          </Text>
          {needsManualReview(item) ? (
            <Text style={styles.reviewFlag} numberOfLines={1}>
              Niska jakość skanu
            </Text>
          ) : null}
          <View style={styles.gridBadges}>
            <OcrStatusBadge status={item.ocrStatus} />
            <AiStatusBadge status={item.aiStatus} />
          </View>
        </View>
      </Pressable>
    ),
    [actionBusy, openPageMenu]
  );

  const renderListPage = useCallback(
    ({ item }: { item: BookPage }) => (
      <Pressable
        style={({ pressed }) => [styles.listRow, pressed && styles.pageHeaderPressed]}
        onPress={() => openPageMenu(item)}
        disabled={actionBusy}>
        <Image source={{ uri: item.imageUri }} style={styles.listThumb} resizeMode="cover" />
        <View style={styles.listText}>
          <Text style={styles.pageTitle}>Strona {item.index}</Text>
          {item.printedPageNumber ? (
            <Text style={styles.pageSubtitle}>w książce: {item.printedPageNumber}</Text>
          ) : null}
          {needsManualReview(item) ? (
            <Text style={styles.reviewFlag}>Niska jakość skanu</Text>
          ) : null}
        </View>
        <View style={styles.pageBadges}>
          <OcrStatusBadge status={item.ocrStatus} />
          <AiStatusBadge status={item.aiStatus} />
        </View>
        <Icon name="more" size={18} color={colors.faint} />
      </Pressable>
    ),
    [actionBusy, openPageMenu]
  );

  const renderPage = viewMode === 'grid' ? renderGridPage : viewMode === 'list' ? renderListPage : renderCardsPage;

  if (loading && !book) {
    return <Loader label="Otwieram książkę…" />;
  }

  if (!book) {
    return null;
  }

  const bottomPad = DOCK_HEIGHT + insets.bottom + DOCK_BOTTOM_GAP + space.xl;
  const hasPages = book.pages.length > 0;

  return (
    <View style={styles.root}>
      <AppBar
        title={book.title}
        subtitle={
          pageFilter === 'manual'
            ? `Niska jakość skanu: ${manualReviewCount}`
            : `${pagesLabel(book.pages.length)} · rozpoznane ${doneCount}`
        }
      />

      {hasPages ? (
        <SegmentedControl
          options={VIEW_MODES}
          value={viewMode}
          onChange={setViewMode}
          style={styles.viewModeBar}
        />
      ) : null}

      {hasPages && manualReviewCount > 0 ? (
        <SegmentedControl
          options={PAGE_FILTERS.map((option) =>
            option.id === 'manual'
              ? { ...option, label: `Niska jakość skanu (${manualReviewCount})` }
              : option
          )}
          value={pageFilter}
          onChange={setPageFilter}
          style={styles.filterBar}
        />
      ) : null}

      <FlatList
        key={`${viewMode}:${pageFilter}`}
        data={visiblePages}
        keyExtractor={(item) => item.id}
        renderItem={renderPage}
        numColumns={viewMode === 'grid' ? GRID_COLUMNS : 1}
        columnWrapperStyle={viewMode === 'grid' ? styles.gridRow : undefined}
        extraData={`${showOcr}:${viewMode}:${pageFilter}`}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={false}
        windowSize={viewMode === 'cards' ? 5 : 9}
        initialNumToRender={viewMode === 'cards' ? 3 : 8}
        maxToRenderPerBatch={viewMode === 'cards' ? 3 : 8}
        contentContainerStyle={[styles.feed, { paddingBottom: bottomPad }]}
        ListHeaderComponent={
          <View style={styles.feedHeader}>
            <ScanQueueCard />
            {showOcrPromo ? (
              <OcrPromoCard
                count={ocrPendingCount}
                onPress={onRunBookOcr}
                disabled={actionBusy}
              />
            ) : null}
            <AiQueueCard />
            {aiQueue.total === 0 && showAiLimitPromo ? (
              <AiLimitPromoCard
                count={aiPendingCount}
                onPress={() => router.push('/subscribe')}
              />
            ) : null}
            {aiQueue.total === 0 && !showAiLimitPromo ? (
              <AiPromoCard
                count={aiPendingCount}
                onPress={onRunBookAi}
                disabled={actionBusy}
              />
            ) : null}
            {pageFilter === 'manual' ? (
              <View style={styles.filterHint}>
                <Icon name="alert" size={16} color={colors.warning} />
                <Text style={styles.filterHintText}>
                  Jakość OCR poniżej 0,50 lub spójność po AI poniżej 0,60 — przejrzyj tekst ręcznie.
                </Text>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          pageFilter === 'manual' ? (
            <EmptyState
              icon="checkCircle"
              title="Brak stron o niskiej jakości"
              body="Żadna strona nie ma słabej jakości OCR ani niskiej spójności po korekcie."
              action={{
                label: 'Pokaż wszystkie',
                icon: 'notes',
                onPress: () => setPageFilter('all'),
              }}
            />
          ) : (
            <EmptyState
              icon="camera"
              title="Brak stron"
              body="Zrób zdjęcie pierwszej strony — kadrowanie i odczyt tekstu zrobią się same."
              action={{
                label: 'Skanuj stronę',
                icon: 'camera',
                onPress: () => router.push(`/book/${book.id}/capture`),
              }}
            />
          )
        }
        ItemSeparatorComponent={
          viewMode === 'grid' ? undefined : () => <View style={{ height: space.lg }} />
        }
      />

      <View
        pointerEvents="box-none"
        style={[styles.dockWrap, { paddingBottom: insets.bottom + DOCK_BOTTOM_GAP }]}>
        <View style={styles.dock}>
          <DockButton
            icon="pdf"
            label="PDF"
            disabled={!hasPages}
            onPress={() => router.push(`/book/${book.id}/export`)}
          />
          <DockButton
            icon="text"
            label="Tekst"
            active={showOcr}
            disabled={!hasPages}
            onPress={() => setShowOcr((value) => !value)}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Skanuj strony"
            onPress={() => router.push(`/book/${book.id}/capture`)}
            style={({ pressed }) => [styles.dockFabSlot, pressed && styles.dockPressed]}>
            <View style={styles.dockFab}>
              <Icon name="scan" size={22} color={colors.white} />
            </View>
          </Pressable>
          <DockButton
            icon="ai"
            label={aiPendingCount > 0 ? `AI ${aiPendingCount}` : 'AI'}
            disabled={!hasPages || actionBusy}
            onPress={onRunBookAi}
          />
          <DockButton icon="more" label="Więcej" onPress={() => setBookMenu(true)} />
        </View>
      </View>

      <Sheet
        visible={menuPage != null}
        onClose={closePageMenu}
        eyebrow="Strona"
        title={menuPage ? `Strona ${menuPage.index}` : ''}>
        <SheetGroup>
          <Row
            icon="stats"
            label="Analiza AI"
            detail={
              menuPage?.aiAnalysis
                ? 'Tytuł, jakość OCR i numer strony'
                : menuPage?.aiStatus === 'done'
                  ? 'Brak metadanych — uruchom korektę ponownie'
                  : 'Dostępna po udanej korekcie AI'
            }
            disabled={!menuPage?.aiAnalysis}
            onPress={() => {
              const page = menuPage;
              closePageMenu();
              if (page?.aiAnalysis) setAnalysisTarget(page);
            }}
          />
          <SheetDivider />
          <Row icon="rotate" label="Obróć 180°" detail="Obraca zdjęcie i czyta je ponownie" onPress={onRotate180} />
          <SheetDivider />
          <Row
            icon="ai"
            label={menuPage?.ocrStatus === 'idle' ? 'Odczytaj tekst' : 'Ponowny odczyt'}
            detail={
              menuPage?.ocrStatus === 'idle'
                ? isLoggedIn
                  ? 'Uruchom OCR dla tego zdjęcia (limit free: 30/mies.)'
                  : 'Wymaga zalogowania'
                : 'Odczytaj tekst ze zdjęcia od nowa'
            }
            onPress={onRetryOcr}
          />
          <SheetDivider />
          <Row icon="gallery" label="Wgraj nowe zdjęcie" onPress={onReplacePhoto} />
        </SheetGroup>

        <SheetGroup>
          <Row icon="edit" label="Edytuj tekst i numer" tone="primary" onPress={onEditPage} />
        </SheetGroup>

        <SheetGroup>
          <Row
            icon="trash"
            label="Usuń stronę"
            tone="danger"
            onPress={() => {
              const page = menuPage;
              closePageMenu();
              setDeletePageTarget(page);
            }}
          />
        </SheetGroup>
      </Sheet>

      <Sheet
        visible={bookMenu}
        onClose={() => setBookMenu(false)}
        eyebrow="Książka"
        title={book.title}>
        <SheetGroup>
          <Row icon="edit" label="Zmień nazwę" onPress={openRename} />
          <SheetDivider />
          <Row
            icon="image"
            label={book.coverUri ? 'Zmień okładkę' : 'Dodaj okładkę'}
            detail="Zdjęcie z galerii"
            onPress={onPickCover}
          />
          {book.coverUri ? (
            <>
              <SheetDivider />
              <Row icon="trash" label="Usuń okładkę" onPress={onClearCover} />
            </>
          ) : null}
          <SheetDivider />
          <Row
            icon="camera"
            label="Skanuj strony"
            tone="primary"
            onPress={() => {
              setBookMenu(false);
              router.push(`/book/${book.id}/capture`);
            }}
          />
          <SheetDivider />
          <Row
            icon="notes"
            label="Cały tekst"
            detail="Podgląd i udostępnianie tekstu"
            onPress={() => {
              setBookMenu(false);
              router.push(`/book/${book.id}/text`);
            }}
          />
          <SheetDivider />
          <Row
            icon="ai"
            label="Korekta AI całej książki"
            detail={
              aiPendingCount > 0
                ? `${aiPendingCount} stron czeka na AI (pomija już gotowe)`
                : 'Wszystkie odczytane strony mają już korektę AI'
            }
            disabled={!hasPages || actionBusy}
            onPress={() => {
              setBookMenu(false);
              onRunBookAi();
            }}
          />
          <SheetDivider />
          <Row
            icon="pdf"
            label="Eksport PDF"
            disabled={!hasPages}
            onPress={() => {
              setBookMenu(false);
              router.push(`/book/${book.id}/export`);
            }}
          />
        </SheetGroup>

        <SheetGroup>
          <Row
            icon="trash"
            label="Usuń książkę"
            tone="danger"
            onPress={() => {
              setBookMenu(false);
              setDeleteBookOpen(true);
            }}
          />
        </SheetGroup>
      </Sheet>

      <Dialog
        visible={renameOpen}
        onClose={() => setRenameOpen(false)}
        icon="edit"
        title="Zmień nazwę"
        body="Nowa nazwa książki w bibliotece."
        actions={
          <>
            <Button
              label="Anuluj"
              variant="outline"
              onPress={() => setRenameOpen(false)}
              style={styles.dialogFlex}
            />
            <Button
              label="Zapisz"
              icon="check"
              loading={renaming}
              onPress={onRename}
              style={styles.dialogFlex}
            />
          </>
        }>
        <TextField
          value={renameTitle}
          onChangeText={setRenameTitle}
          placeholder="Tytuł książki"
          icon="bookOpen"
          autoFocus
          returnKeyType="done"
          onSubmitEditing={onRename}
        />
      </Dialog>

      <ConfirmDialog
        visible={deleteBookOpen}
        title="Usunąć książkę?"
        body={`„${book.title}” i ${pagesLabel(book.pages.length)} zniknie z urządzenia.`}
        confirmLabel="Usuń"
        onConfirm={onConfirmDeleteBook}
        onCancel={() => setDeleteBookOpen(false)}
      />

      <ConfirmDialog
        visible={deletePageTarget != null}
        title="Usunąć stronę?"
        body={
          deletePageTarget
            ? `Strona ${deletePageTarget.index} wraz ze zdjęciem i tekstem zostanie usunięta.`
            : undefined
        }
        confirmLabel="Usuń"
        onConfirm={onConfirmDeletePage}
        onCancel={() => setDeletePageTarget(null)}
      />

      <AiAnalysisDialog
        visible={analysisTarget != null}
        analysis={analysisTarget?.aiAnalysis ?? null}
        pageIndex={analysisTarget?.index}
        onClose={() => setAnalysisTarget(null)}
      />

      <BusyOverlay visible={actionBusy} label="Pracuję…" />
    </View>
  );
}

function formatScore(value: number): string {
  return value.toFixed(2);
}

function AiAnalysisDialog({
  visible,
  analysis,
  pageIndex,
  onClose,
}: {
  visible: boolean;
  analysis: AiAnalysis | null;
  pageIndex?: number;
  onClose: () => void;
}) {
  return (
    <Dialog
      visible={visible}
      onClose={onClose}
      icon="stats"
      title={pageIndex != null ? `Analiza AI · strona ${pageIndex}` : 'Analiza AI'}
      body="Wynik ostatniej korekty Gemini dla tej strony."
      actions={<Button label="Zamknij" variant="outline" onPress={onClose} style={styles.dialogFlex} />}>
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

function SheetDivider() {
  return <View style={styles.sheetDivider} />;
}

function DockButton({
  icon,
  label,
  onPress,
  active,
  disabled,
}: {
  icon: 'pdf' | 'text' | 'ai' | 'more';
  label: string;
  onPress: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  const tint = active ? colors.primary : colors.inkSoft;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, selected: !!active }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.dockItem,
        pressed && !disabled && styles.dockPressed,
        disabled && styles.dockDisabled,
      ]}>
      <Icon name={icon} size={22} color={tint} />
      <Text style={[styles.dockLabel, active && styles.dockLabelActive]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  feed: {
    flexGrow: 1,
    paddingHorizontal: space.lg,
  },
  feedHeader: {
    gap: space.md,
    paddingBottom: space.md,
  },
  viewModeBar: {
    marginHorizontal: space.lg,
    marginBottom: space.md,
  },
  filterBar: {
    marginHorizontal: space.lg,
    marginBottom: space.md,
    marginTop: -space.sm,
  },
  filterHint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.warningSoft,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  filterHintText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: colors.inkSoft,
  },
  reviewFlag: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '700',
    color: colors.warning,
  },
  pageCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
    ...shadow.soft,
  },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  pageHeaderPressed: {
    backgroundColor: colors.pressTint,
  },
  pageIndex: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageIndexText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: colors.white,
  },
  pageHeaderText: {
    flex: 1,
    gap: 1,
  },
  pageBadges: {
    flexDirection: 'row',
    flexShrink: 0,
    alignItems: 'center',
    gap: 4,
  },
  pageTitle: {
    ...font.h3,
    fontSize: 15.5,
  },
  pageSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
  },
  qualityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
  },
  qualityChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  qualityChipOk: {
    backgroundColor: colors.successSoft,
    borderColor: 'rgba(16, 191, 160, 0.28)',
  },
  qualityChipWarn: {
    backgroundColor: colors.warningSoft,
    borderColor: 'rgba(233, 147, 12, 0.3)',
  },
  qualityChipNeutral: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.line,
  },
  qualityChipText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  qualityChipTextOk: {
    color: '#0A8C77',
  },
  qualityChipTextWarn: {
    color: '#A96A05',
  },
  qualityChipTextNeutral: {
    color: colors.muted,
  },
  imageFrame: {
    width: CARD_WIDTH,
    height: IMAGE_HEIGHT,
    backgroundColor: colors.surfaceSunken,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  gridRow: {
    gap: GRID_GAP,
    marginBottom: GRID_GAP,
  },
  gridCard: {
    width: GRID_ITEM_WIDTH,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
    ...shadow.soft,
  },
  gridImageFrame: {
    width: '100%',
    height: GRID_IMAGE_HEIGHT,
    backgroundColor: colors.surfaceSunken,
  },
  gridIndex: {
    position: 'absolute',
    top: space.sm,
    left: space.sm,
    minWidth: 28,
    height: 28,
    paddingHorizontal: 8,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridIndexText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.white,
  },
  gridMeta: {
    gap: 6,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
  },
  gridTitle: {
    ...font.h3,
    fontSize: 13.5,
  },
  gridBadges: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    gap: 4,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    ...shadow.soft,
  },
  listThumb: {
    width: LIST_THUMB,
    height: LIST_THUMB,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSunken,
  },
  listText: {
    flex: 1,
    gap: 2,
  },
  ocrOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
    elevation: 10,
    backgroundColor: 'rgba(10, 12, 22, 0.72)',
    paddingTop: space.md,
  },
  ocrChip: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: space.md,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  ocrChipText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: colors.white,
  },
  ocrScroll: {
    flex: 1,
    marginTop: space.md,
  },
  ocrScrollContent: {
    paddingHorizontal: space.lg,
    paddingBottom: space.xxl,
  },
  ocrText: {
    color: colors.white,
    fontSize: 15,
    lineHeight: 23,
    fontWeight: '500',
  },
  dockWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space.xxl,
    alignItems: 'center',
  },
  dock: {
    width: '100%',
    maxWidth: 420,
    height: DOCK_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.xxl,
    backgroundColor: colors.surface,
    paddingHorizontal: space.xs,
    ...shadow.float,
  },
  dockItem: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  dockPressed: {
    opacity: 0.65,
    transform: [{ scale: 0.94 }],
  },
  dockDisabled: {
    opacity: 0.38,
  },
  dockLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.inkSoft,
    letterSpacing: -0.15,
  },
  dockLabelActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  dockFabSlot: {
    width: DOCK_FAB_SIZE + space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dockFab: {
    width: DOCK_FAB_SIZE,
    height: DOCK_FAB_SIZE,
    borderRadius: DOCK_FAB_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    shadowColor: colors.primaryDeep,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 8,
  },
  sheetDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
    marginLeft: space.lg + 36 + space.md,
  },
  dialogFlex: {
    flex: 1,
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
