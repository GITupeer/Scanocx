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
import {
  canRunAiRewrite,
  getAiDetectedPageCount,
  getDisplayText,
  hasReadyText,
  needsAiRewrite,
  needsManualReview,
} from '@/src/ai/displayText';
import {
  AiQuotaExceededError,
  cancelAiForBook,
  cancelAiForPage,
  clearAiQuotaErrorsForBook,
  enqueueAllAiForBook,
  enqueuePendingAiForBook,
  resumePendingCloudAi,
  useAiQueue,
} from '@/src/ai/queue';
import { useAuth } from '@/src/auth/AuthProvider';
import type { AiAnalysis, Book, BookPage } from '@/src/domain/types';
import { getLibraryBook } from '@/src/library/books';
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
  PageImagePlaceholder,
  Row,
  ScanQueueCard,
  SegmentedControl,
  Sheet,
  SheetGroup,
  TableOfContentsCard,
  TextField,
  buildTableOfContents,
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
type PageSort = 'system' | 'book';
type PageSortDir = 'asc' | 'desc';
type MainTab = 'pages' | 'toc';

const MAIN_TABS = [
  { id: 'pages', label: 'Strony' },
  { id: 'toc', label: 'Spis treści' },
] as const satisfies readonly { id: MainTab; label: string }[];

const VIEW_MODE_OPTIONS = [
  { id: 'list', icon: 'notes' as const, label: 'Lista' },
  { id: 'grid', icon: 'grid' as const, label: 'Siatka' },
  { id: 'cards', icon: 'image' as const, label: 'Karty' },
] as const;

const PAGE_SORT_OPTIONS = [
  {
    id: 'book' as const,
    icon: 'bookOpen' as const,
    label: 'Strony z książki',
    detail: 'Sortowanie po numerze wydrukowanym na stronie',
  },
  {
    id: 'system' as const,
    icon: 'notes' as const,
    label: 'Strony z systemu',
    detail: 'Sortowanie po numerze strony w Scanocx',
  },
] as const;

const PAGE_SORT_DIR_OPTIONS = [
  {
    id: 'asc' as const,
    icon: 'sort' as const,
    label: 'A–Z',
    detail: 'Od najmniejszego numeru',
  },
  {
    id: 'desc' as const,
    icon: 'sort' as const,
    label: 'Z–A',
    detail: 'Od największego numeru',
  },
] as const;

const ROMAN_VALUES: Record<string, number> = {
  i: 1,
  v: 5,
  x: 10,
  l: 50,
  c: 100,
  d: 500,
  m: 1000,
};

function romanToInt(value: string): number | null {
  const lower = value.toLowerCase();
  if (!/^[ivxlcdm]+$/.test(lower)) return null;
  let total = 0;
  let prev = 0;
  for (let i = lower.length - 1; i >= 0; i -= 1) {
    const current = ROMAN_VALUES[lower[i]] ?? 0;
    if (current < prev) total -= current;
    else total += current;
    prev = current;
  }
  return total;
}

/** Klucz sortowania po numerze z książki (arabskie / rzymskie); brak numeru → na koniec. */
function printedPageSortKey(value: string | null): {
  missing: boolean;
  numeric: number;
  raw: string;
} {
  const raw = value?.trim() ?? '';
  if (!raw) {
    return { missing: true, numeric: Number.POSITIVE_INFINITY, raw: '' };
  }
  if (/^\d{1,6}$/.test(raw)) {
    return { missing: false, numeric: Number.parseInt(raw, 10), raw };
  }
  const roman = romanToInt(raw);
  if (roman != null) {
    return { missing: false, numeric: roman, raw: raw.toLowerCase() };
  }
  return { missing: false, numeric: Number.POSITIVE_INFINITY, raw: raw.toLowerCase() };
}

function comparePagesBySort(
  a: BookPage,
  b: BookPage,
  sort: PageSort,
  dir: PageSortDir
): number {
  const sign = dir === 'desc' ? -1 : 1;

  if (sort === 'system') {
    return sign * (a.index - b.index);
  }

  const ka = printedPageSortKey(a.printedPageNumber);
  const kb = printedPageSortKey(b.printedPageNumber);
  // Bez numeru zawsze na końcu, niezależnie od kierunku.
  if (ka.missing !== kb.missing) return ka.missing ? 1 : -1;
  if (ka.numeric !== kb.numeric) return sign * (ka.numeric - kb.numeric);
  const byRaw = ka.raw.localeCompare(kb.raw, 'pl');
  if (byRaw !== 0) return sign * byRaw;
  return sign * (a.index - b.index);
}

function ocrOverlayCopy(page: BookPage): string {
  if (page.ocrStatus === 'pending') return 'Odczytywanie tekstu…';
  if (page.aiOnly && page.ocrStatus === 'idle' && page.aiStatus === 'idle') {
    return 'Skan wielu stron — uruchom Analizę AI, aby odczytać tekst.';
  }
  if (page.ocrStatus === 'idle') {
    return 'Zdjęcie zapisane — zaloguj się i uruchom odczyt tekstu.';
  }
  if (page.aiStatus === 'pending') return 'Analiza i Korekta AI w toku…';
  if (page.aiStatus === 'error') {
    return page.aiError?.trim() || 'Błąd korekty AI.';
  }
  if (page.ocrStatus === 'error') return 'Nie udało się odczytać tekstu z tej strony.';
  const pages = page.aiAnalysis?.pages;
  if (pages && pages.length > 1) {
    return pages
      .map((p, i) => `— Strona ${i + 1}${p.pageNumber ? ` (${p.pageNumber})` : ''} —\n${p.text}`)
      .join('\n\n');
  }
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
  const { ready, isLoggedIn, user, refresh: refreshAuth } = useAuth();
  const [book, setBook] = useState<Book | null>(null);
  const [loading, setLoading] = useState(true);
  const [showOcr, setShowOcr] = useState(false);
  const [mainTab, setMainTab] = useState<MainTab>('pages');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [pageFilter, setPageFilter] = useState<PageFilter>('all');
  const [pageSort, setPageSort] = useState<PageSort>('system');
  const [pageSortDir, setPageSortDir] = useState<PageSortDir>('desc');
  const [viewOptionsOpen, setViewOptionsOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [menuPage, setMenuPage] = useState<BookPage | null>(null);
  const [analysisTarget, setAnalysisTarget] = useState<BookPage | null>(null);
  const [bookMenu, setBookMenu] = useState(false);
  const [aiMenuOpen, setAiMenuOpen] = useState(false);
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
    if (!id || !isLoggedIn) return;
    setLoading(true);
    try {
      const data = await getLibraryBook(id);
      setBook(data);
    } catch (error) {
      Alert.alert('Błąd', error instanceof Error ? error.message : 'Nie znaleziono książki.');
      router.replace('/');
    } finally {
      setLoading(false);
    }
  }, [id, isLoggedIn, router]);

  useEffect(() => {
    if (!ready) return;
    if (!isLoggedIn) {
      router.replace('/login');
    }
  }, [ready, isLoggedIn, router]);

  useFocusEffect(
    useCallback(() => {
      if (!isLoggedIn) return;
      void refresh();
      void refreshAuth();
    }, [isLoggedIn, refresh, refreshAuth])
  );

  // Każda strona zamknięta przez kolejkę zmienia meta.json — przeczytaj je ponownie,
  // żeby plakietki i tekst OCR/AI aktualizowały się na żywo.
  // Nie odświeżaj podczas przygotowania/wysyłki (prepared) — to wywoływało
  // Maximum update depth przy setkach stron.
  const lastOcrCompletedRef = useRef(ocrQueue.completed);
  const lastAiCompletedRef = useRef(aiQueue.completed);
  useEffect(() => {
    if (
      aiQueue.phase === 'preparing' ||
      aiQueue.phase === 'sending'
    ) {
      return;
    }
    if (
      ocrQueue.completed === lastOcrCompletedRef.current &&
      aiQueue.completed === lastAiCompletedRef.current
    ) {
      return;
    }
    lastOcrCompletedRef.current = ocrQueue.completed;
    lastAiCompletedRef.current = aiQueue.completed;
    void refresh();
    if (aiQueue.completed > 0 && aiQueue.phase !== 'preparing' && aiQueue.phase !== 'sending') {
      void refreshAuth();
    }
  }, [aiQueue.completed, aiQueue.phase, ocrQueue.completed, refresh, refreshAuth]);

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
      const jobs = unprocessed
        .filter((page) => Boolean(page.imageUri?.trim()))
        .map((page) => ({
          bookId: book.id,
          pageId: page.id,
          pageIndex: page.index,
          imageUri: page.imageUri!,
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

  const sortedPages = useMemo(() => {
    if (!book) return [];
    return [...book.pages].sort((a, b) =>
      comparePagesBySort(a, b, pageSort, pageSortDir)
    );
  }, [book, pageSort, pageSortDir]);

  const manualReviewCount = useMemo(
    () => sortedPages.filter(needsManualReview).length,
    [sortedPages]
  );

  const visiblePages = useMemo(() => {
    if (pageFilter !== 'manual') return sortedPages;
    return sortedPages.filter(needsManualReview);
  }, [pageFilter, sortedPages]);

  useEffect(() => {
    if (pageFilter === 'manual' && manualReviewCount === 0) {
      setPageFilter('all');
    }
  }, [manualReviewCount, pageFilter]);

  const doneCount = useMemo(
    () => (book ? book.pages.filter(hasReadyText).length : 0),
    [book]
  );

  /** Zdjęcia bez OCR (idle / błąd) — czekają na odczyt (bez stron aiOnly). */
  const ocrPendingCount = useMemo(
    () =>
      book
        ? book.pages.filter(
            (page) =>
              !page.aiOnly &&
              (page.ocrStatus === 'idle' || page.ocrStatus === 'error')
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

  const aiEligibleCount = useMemo(
    () => (book ? book.pages.filter(canRunAiRewrite).length : 0),
    [book]
  );

  const tableOfContents = useMemo(
    () => (book ? buildTableOfContents(book.pages) : []),
    [book]
  );

  const aiRemaining = user?.quota?.remaining ?? null;
  const showAiLimitPromo =
    isLoggedIn &&
    aiPendingCount > 0 &&
    aiQueue.total === 0 &&
    aiRemaining != null &&
    aiRemaining <= 0;

  const openAiMenu = useCallback(() => {
    if (!book || actionBusy) return;
    if (!isApiConfigured()) return;
    if (!isLoggedIn) {
      router.push('/login');
      return;
    }
    if (aiRemaining != null && aiRemaining <= 0) {
      router.push('/subscribe');
      return;
    }
    if (aiEligibleCount === 0) {
      Alert.alert(
        'Analiza i Korekta AI',
        'Brak stron ze zdjęciem do analizy. Najpierw zeskanuj lub dodaj strony.'
      );
      return;
    }
    setAiMenuOpen(true);
  }, [actionBusy, aiEligibleCount, aiRemaining, book, isLoggedIn, router]);

  const onRunBookOcr = useCallback(() => {
    if (!book) return;
    if (!isLoggedIn) {
      router.push('/login');
      return;
    }
    const waiting = book.pages.filter(
      (page) =>
        !page.aiOnly &&
        (page.ocrStatus === 'idle' || page.ocrStatus === 'error') &&
        Boolean(page.imageUri?.trim())
    );
    if (waiting.length === 0) return;

    void (async () => {
      const remaining = await getOcrRemaining();
      const slice =
        remaining == null ? waiting : waiting.slice(0, Math.max(0, remaining));
      if (slice.length === 0) {
        Alert.alert(
          'Limit OCR',
          'Brak dostępnych odczytów w tym miesiącu. Przejdź na Pro, aby mieć większy limit OCR.'
        );
        return;
      }
      enqueueOcrJobs(
        slice.map((page) => ({
          bookId: book.id,
          pageId: page.id,
          pageIndex: page.index,
          imageUri: page.imageUri!,
        }))
      );
    })();
  }, [book, isLoggedIn, router]);

  const onRunBookAi = useCallback(
    (mode: 'pending' | 'all') => {
      if (!book) return;
      if (!isApiConfigured()) return;
      if (!isLoggedIn) {
        router.push('/login');
        return;
      }
      if (aiRemaining != null && aiRemaining <= 0) {
        setAiMenuOpen(false);
        router.push('/subscribe');
        return;
      }
      setAiMenuOpen(false);
      const run =
        mode === 'all'
          ? enqueueAllAiForBook(book.id)
          : enqueuePendingAiForBook(book.id);
      void run
        .then(async () => {
          await refreshAuth();
          await refresh();
        })
        .catch((error) => {
          if (error instanceof AiQuotaExceededError) {
            router.push('/subscribe');
            return;
          }
          // Inne błędy widać w AiQueueCard / badge’ach stron.
        });
    },
    [aiRemaining, book, isLoggedIn, refresh, refreshAuth, router]
  );

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
    if (menuPage.aiOnly) {
      closePageMenu();
      Alert.alert(
        'Odczyt tekstu',
        'Ta strona to skan wielu stron — użyj Analizy AI zamiast zwykłego OCR.',
      );
      return;
    }
    if (!isLoggedIn) {
      closePageMenu();
      router.push('/login');
      return;
    }
    if (!menuPage.imageUri?.trim()) {
      closePageMenu();
      Alert.alert('Odczyt tekstu', 'Brak lokalnego zdjęcia tej strony.');
      return;
    }
    const page = menuPage;
    closePageMenu();
    setActionBusy(true);
    void (async () => {
      try {
        await runPageOcrExclusive(book.id, page.id, page.imageUri!);
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
    if (!menuPage.imageUri?.trim()) {
      closePageMenu();
      Alert.alert('Obrót', 'Brak lokalnego zdjęcia tej strony.');
      return;
    }
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
          if (rotated.imageUri?.trim()) {
            await runPageOcrExclusive(book.id, rotated.id, rotated.imageUri, {
              detectUpright: false,
            });
          }
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
            {item.imageUri ? (
              <Image source={{ uri: item.imageUri }} style={styles.image} resizeMode="contain" />
            ) : (
              <PageImagePlaceholder />
            )}
          </Pressable>

          {getAiDetectedPageCount(item) > 1 ? (
            <View style={styles.aiPagesBadge} pointerEvents="none">
              <Icon name="bookOpen" size={12} color={colors.white} />
              <Text style={styles.aiPagesBadgeText}>{getAiDetectedPageCount(item)}</Text>
            </View>
          ) : null}

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
          {item.imageUri ? (
            <Image source={{ uri: item.imageUri }} style={styles.image} resizeMode="cover" />
          ) : (
            <PageImagePlaceholder compact />
          )}
          <Gradient colors={gradients.brand} style={styles.gridIndex}>
            <Text style={styles.gridIndexText}>{item.index}</Text>
          </Gradient>
          {getAiDetectedPageCount(item) > 1 ? (
            <View style={styles.aiPagesBadgeGrid} pointerEvents="none">
              <Icon name="bookOpen" size={11} color={colors.white} />
              <Text style={styles.aiPagesBadgeText}>{getAiDetectedPageCount(item)}</Text>
            </View>
          ) : null}
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
        {item.imageUri ? (
          <Image source={{ uri: item.imageUri }} style={styles.listThumb} resizeMode="cover" />
        ) : (
          <PageImagePlaceholder compact style={styles.listThumb} />
        )}
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

  useEffect(() => {
    if (viewMode !== 'cards' && showOcr) setShowOcr(false);
  }, [showOcr, viewMode]);

  const queuesBusy = ocrQueue.total > 0 || aiQueue.total > 0;
  const showStatusPromo = !queuesBusy && (showOcrPromo || showAiLimitPromo || aiPendingCount > 0);
  const sortIsCustom = pageSort !== 'system' || pageSortDir !== 'desc';

  if (loading && !book) {
    return <Loader label="Otwieram książkę…" />;
  }

  if (!book) {
    return null;
  }

  const bottomPad = DOCK_HEIGHT + insets.bottom + DOCK_BOTTOM_GAP + space.xl;
  const hasPages = book.pages.length > 0;
  const tocCount = tableOfContents.length;

  const openTocEntry = (pageId: string) => {
    router.push(`/book/${book.id}/page/${pageId}`);
  };

  const processingCards = (
    <>
      <ScanQueueCard />
      <AiQueueCard />
      {showStatusPromo ? (
        showAiLimitPromo ? (
          <AiLimitPromoCard
            count={aiPendingCount}
            onPress={() => router.push('/subscribe')}
          />
        ) : aiPendingCount > 0 ? (
          <AiPromoCard
            count={aiPendingCount}
            onPress={openAiMenu}
            disabled={actionBusy}
          />
        ) : showOcrPromo ? (
          <OcrPromoCard
            count={ocrPendingCount}
            onPress={onRunBookOcr}
            disabled={actionBusy}
          />
        ) : null
      ) : null}
    </>
  );

  const pagesListHeader = (
    <View style={styles.feedHeader}>
      {processingCards}
      {pageFilter === 'manual' ? (
        <View style={styles.filterHint}>
          <Icon name="alert" size={16} color={colors.warning} />
          <Text style={styles.filterHintText}>
            Niska jakość OCR lub spójność AI — przejrzyj te strony ręcznie.
          </Text>
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={styles.root}>
      <AppBar
        title={book.title}
        subtitle={
          mainTab === 'toc'
            ? tocCount > 0
              ? `${tocCount} pozycji ze skanu AI`
              : 'Nagłówki z analizy AI'
            : pageFilter === 'manual'
              ? `Do sprawdzenia: ${manualReviewCount}`
              : `${pagesLabel(book.pages.length)} · odczytane ${doneCount}`
        }
      />

      {hasPages ? (
        <SegmentedControl
          options={MAIN_TABS.map((tab) =>
            tab.id === 'toc' && tocCount > 0
              ? { ...tab, label: `Spis treści (${tocCount})` }
              : tab
          )}
          value={mainTab}
          onChange={setMainTab}
          style={styles.mainTabs}
        />
      ) : null}

      {mainTab === 'toc' && hasPages ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.feed, styles.tocFeed, { paddingBottom: bottomPad }]}>
          {processingCards}
          {tocCount > 0 ? (
            <>
              <Text style={styles.tocLead}>
                Tytuły i podtytuły wykryte przez AI. Dotknij, aby otworzyć stronę.
              </Text>
              <TableOfContentsCard
                plain
                entries={tableOfContents}
                onPressEntry={(entry) => openTocEntry(entry.pageId)}
              />
            </>
          ) : (
            <EmptyState
              icon="notes"
              title="Spis treści pusty"
              body="Uruchom korektę AI — wykryte nagłówki pojawią się tutaj automatycznie."
              action={
                aiEligibleCount > 0
                  ? {
                      label: 'Uruchom AI',
                      icon: 'ai',
                      onPress: openAiMenu,
                    }
                  : {
                      label: 'Przejdź do stron',
                      icon: 'image',
                      onPress: () => setMainTab('pages'),
                    }
              }
            />
          )}
        </ScrollView>
      ) : (
        <>
          {hasPages ? (
            <View style={styles.tools}>
              {manualReviewCount > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: pageFilter === 'manual' }}
                  onPress={() =>
                    setPageFilter((current) => (current === 'manual' ? 'all' : 'manual'))
                  }
                  style={[
                    styles.filterChip,
                    pageFilter === 'manual' && styles.filterChipActive,
                  ]}>
                  <Icon
                    name="alert"
                    size={14}
                    color={pageFilter === 'manual' ? colors.warning : colors.muted}
                  />
                  <Text
                    style={[
                      styles.filterChipText,
                      pageFilter === 'manual' && styles.filterChipTextActive,
                    ]}>
                    Do sprawdzenia · {manualReviewCount}
                  </Text>
                </Pressable>
              ) : (
                <Text style={styles.toolsHint}>{pagesLabel(visiblePages.length)}</Text>
              )}

              <View style={styles.toolsRight}>
                {viewMode === 'cards' ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Podgląd tekstu na zdjęciach"
                    accessibilityState={{ selected: showOcr }}
                    onPress={() => setShowOcr((value) => !value)}
                    style={[styles.toolIconBtn, showOcr && styles.toolIconBtnActive]}>
                    <Icon
                      name="text"
                      size={18}
                      color={showOcr ? colors.primary : colors.inkSoft}
                    />
                  </Pressable>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Sortowanie stron"
                  onPress={() => setSortOpen(true)}
                  style={[styles.toolIconBtn, sortIsCustom && styles.toolIconBtnActive]}>
                  <Icon
                    name="sort"
                    size={18}
                    color={sortIsCustom ? colors.primary : colors.inkSoft}
                  />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Widok i opcje"
                  onPress={() => setViewOptionsOpen(true)}
                  style={styles.toolIconBtn}>
                  <Icon name="tune" size={18} color={colors.inkSoft} />
                </Pressable>
              </View>
            </View>
          ) : null}

          <FlatList
            key={`${viewMode}:${pageFilter}:${pageSort}:${pageSortDir}`}
            data={visiblePages}
            keyExtractor={(item) => item.id}
            renderItem={renderPage}
            numColumns={viewMode === 'grid' ? GRID_COLUMNS : 1}
            columnWrapperStyle={viewMode === 'grid' ? styles.gridRow : undefined}
            extraData={`${showOcr}:${viewMode}:${pageFilter}:${pageSort}:${pageSortDir}`}
            showsVerticalScrollIndicator={false}
            removeClippedSubviews={false}
            windowSize={viewMode === 'cards' ? 5 : 9}
            initialNumToRender={viewMode === 'cards' ? 3 : 8}
            maxToRenderPerBatch={viewMode === 'cards' ? 3 : 8}
            contentContainerStyle={[styles.feed, { paddingBottom: bottomPad }]}
            ListHeaderComponent={pagesListHeader}
            ListEmptyComponent={
              pageFilter === 'manual' ? (
                <EmptyState
                  icon="checkCircle"
                  title="Brak stron do sprawdzenia"
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
              viewMode === 'grid' ? undefined : () => <View style={{ height: space.md }} />
            }
          />
        </>
      )}

      <View
        pointerEvents="box-none"
        style={[styles.dockWrap, { paddingBottom: insets.bottom + DOCK_BOTTOM_GAP }]}>
        <View style={styles.dock}>
          <DockButton
            icon="export"
            label="Export"
            disabled={!hasPages}
            onPress={() => router.push(`/book/${book.id}/export`)}
          />
          <DockButton
            icon="text"
            label="Tekst"
            disabled={!hasPages}
            onPress={() => router.push(`/book/${book.id}/text`)}
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
            onPress={openAiMenu}
          />
          <DockButton icon="more" label="Więcej" onPress={() => setBookMenu(true)} />
        </View>
      </View>

      <Sheet
        visible={sortOpen}
        onClose={() => setSortOpen(false)}
        eyebrow="Sortowanie"
        title="Uporządkuj listę stron">
        <SheetGroup>
          {PAGE_SORT_OPTIONS.map((option, index) => (
            <View key={option.id}>
              {index > 0 ? <SheetDivider /> : null}
              <Row
                icon={option.icon}
                label={option.label}
                detail={option.detail}
                tone={pageSort === option.id ? 'primary' : 'default'}
                onPress={() => setPageSort(option.id)}
              />
            </View>
          ))}
        </SheetGroup>
        <SheetGroup>
          {PAGE_SORT_DIR_OPTIONS.map((option, index) => (
            <View key={option.id}>
              {index > 0 ? <SheetDivider /> : null}
              <Row
                icon={option.icon}
                label={option.label}
                detail={option.detail}
                tone={pageSortDir === option.id ? 'primary' : 'default'}
                onPress={() => {
                  setPageSortDir(option.id);
                  setSortOpen(false);
                }}
              />
            </View>
          ))}
        </SheetGroup>
      </Sheet>

      <Sheet
        visible={viewOptionsOpen}
        onClose={() => setViewOptionsOpen(false)}
        eyebrow="Widok"
        title="Jak pokazać strony">
        <SheetGroup>
          {VIEW_MODE_OPTIONS.map((option, index) => (
            <View key={option.id}>
              {index > 0 ? <SheetDivider /> : null}
              <Row
                icon={option.icon}
                label={option.label}
                detail={
                  option.id === 'list'
                    ? 'Szybki przegląd wielu stron'
                    : option.id === 'grid'
                      ? 'Miniatury obok siebie'
                      : 'Duże zdjęcia z podglądem tekstu'
                }
                tone={viewMode === option.id ? 'primary' : 'default'}
                onPress={() => {
                  setViewMode(option.id);
                  setViewOptionsOpen(false);
                }}
              />
            </View>
          ))}
        </SheetGroup>
        {viewMode === 'cards' ? (
          <SheetGroup>
            <Row
              icon="text"
              label={showOcr ? 'Ukryj tekst na zdjęciach' : 'Pokaż tekst na zdjęciach'}
              detail="Nakładka OCR / AI na kartach"
              onPress={() => {
                setShowOcr((value) => !value);
                setViewOptionsOpen(false);
              }}
            />
          </SheetGroup>
        ) : null}
        {manualReviewCount > 0 ? (
          <SheetGroup>
            <Row
              icon="alert"
              label={
                pageFilter === 'manual'
                  ? 'Pokaż wszystkie strony'
                  : `Tylko do sprawdzenia (${manualReviewCount})`
              }
              detail="Niska jakość OCR lub spójność AI"
              onPress={() => {
                setPageFilter((current) => (current === 'manual' ? 'all' : 'manual'));
                setViewOptionsOpen(false);
              }}
            />
          </SheetGroup>
        ) : null}
      </Sheet>

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
          {!menuPage?.aiOnly ? (
            <>
              <SheetDivider />
              <Row
                icon="ai"
                label={menuPage?.ocrStatus === 'idle' ? 'Odczytaj tekst' : 'Ponowny odczyt'}
                detail={
                  menuPage?.ocrStatus === 'idle'
                    ? isLoggedIn
                      ? 'Uruchom OCR dla tego zdjęcia (limit free: 50/mies.)'
                      : 'Wymaga zalogowania'
                    : 'Odczytaj tekst ze zdjęcia od nowa'
                }
                onPress={onRetryOcr}
              />
            </>
          ) : (
            <>
              <SheetDivider />
              <Row
                icon="ai"
                label="Odczyt tylko AI"
                detail="Skan wielu stron — uruchom Analizę AI"
                disabled
                onPress={() => undefined}
              />
            </>
          )}
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
        visible={aiMenuOpen}
        onClose={() => setAiMenuOpen(false)}
        eyebrow="Analiza i Korekta AI"
        title="Wybierz zakres analizy">
        <SheetGroup>
          <Row
            icon="ai"
            label="Analiza i korekta nieukończonych"
            detail={
              aiPendingCount > 0
                ? `${aiPendingCount} stron jeszcze bez AI`
                : 'Wszystkie strony ze zdjęciem mają już korektę'
            }
            tone="primary"
            disabled={aiPendingCount === 0 || actionBusy}
            onPress={() => onRunBookAi('pending')}
          />
          <SheetDivider />
          <Row
            icon="stats"
            label="Analiza wszystkich stron"
            detail={
              aiEligibleCount > 0
                ? `${aiEligibleCount} stron ze zdjęciem — także już gotowych`
                : 'Brak stron ze zdjęciem'
            }
            disabled={aiEligibleCount === 0 || actionBusy}
            onPress={() => onRunBookAi('all')}
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
            icon="bookOpen"
            label="Spis treści"
            detail={
              tocCount > 0
                ? `${tocCount} nagłówków z AI`
                : 'Pojawi się po korekcie AI'
            }
            onPress={() => {
              setBookMenu(false);
              setMainTab('toc');
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
            label="Analiza i Korekta AI całej książki"
            detail={
              aiEligibleCount > 0
                ? `${aiPendingCount} bez korekty · ${aiEligibleCount} ze zdjęciem`
                : 'Brak stron ze zdjęciem'
            }
            disabled={!hasPages || actionBusy || aiEligibleCount === 0}
            onPress={() => {
              setBookMenu(false);
              openAiMenu();
            }}
          />
          <SheetDivider />
          <Row
            icon="export"
            label="Export"
            detail="TXT · PDF · eBook"
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

function formatTokenCount(value: number | null): string {
  if (value == null) return 'Brak danych';
  return value.toLocaleString('pl-PL');
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
  icon: 'export' | 'text' | 'ai' | 'more';
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
  tocFeed: {
    paddingTop: space.sm,
    gap: space.md,
  },
  tocLead: {
    fontSize: 13.5,
    fontWeight: '500',
    color: colors.muted,
    lineHeight: 19,
  },
  mainTabs: {
    marginHorizontal: space.lg,
    marginBottom: space.md,
  },
  tools: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    marginHorizontal: space.lg,
    marginBottom: space.md,
  },
  toolsHint: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
  },
  toolsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  toolIconBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  toolIconBtnActive: {
    backgroundColor: colors.primarySoft,
    borderColor: 'rgba(108, 76, 241, 0.28)',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '70%',
    paddingHorizontal: space.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  filterChipActive: {
    backgroundColor: colors.warningSoft,
    borderColor: 'rgba(233, 147, 12, 0.35)',
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
    letterSpacing: -0.2,
  },
  filterChipTextActive: {
    color: '#A96A05',
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
  aiPagesBadge: {
    position: 'absolute',
    top: space.sm,
    right: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(16, 191, 160, 0.92)',
  },
  aiPagesBadgeGrid: {
    position: 'absolute',
    top: space.sm,
    right: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(16, 191, 160, 0.92)',
  },
  aiPagesBadgeText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
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
