import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/src/auth/AuthProvider';
import type { Book } from '@/src/domain/types';
import {
  buildExportFile,
  deliverExportFile,
  ExportAuthRequiredError,
  ExportCancelledError,
  ExportFormatLockedError,
  ExportQuotaExceededError,
  FREE_PDF_MONTHLY_LIMIT,
  getFormatQuota,
  refreshExportQuota,
  syncExportQuota,
  useExportQuota,
  type ExportDestination,
  type ExportFormat,
} from '@/src/export';
import { getBook } from '@/src/storage/books';
import {
  AiQueueCard,
  BusyOverlay,
  EmptyState,
  FadeInUp,
  Gradient,
  HomeHeroOrbs,
  Icon,
  Loader,
  Row,
  ScanQueueCard,
  Sheet,
  SheetGroup,
  colors,
  gradients,
  radius,
  shadow,
  space,
  type IconName,
} from '@/src/ui';
import { pages as pagesLabel } from '@/src/utils/format';

const SCREEN_W = Dimensions.get('window').width;
const CARD_GAP = space.md;
const STAT_W = (SCREEN_W - space.xl * 2 - CARD_GAP) / 2;

type FormatOption = {
  id: ExportFormat;
  icon: IconName;
  title: string;
  detail: string;
  tint: string;
  iconColor: string;
};

const FORMATS: FormatOption[] = [
  {
    id: 'txt',
    icon: 'text',
    title: 'TXT',
    detail: 'Zwykły tekst do edycji i kopiowania',
    tint: '#FFF2D9',
    iconColor: '#F59E0B',
  },
  {
    id: 'pdf',
    icon: 'pdf',
    title: 'PDF',
    detail: 'Przeszukiwalny dokument z tekstem stron',
    tint: '#FDE8E6',
    iconColor: '#E24B41',
  },
  {
    id: 'epub',
    icon: 'ebook',
    title: 'eBook',
    detail: 'Własny EPUB do czytników i aplikacji',
    tint: '#EDE9FE',
    iconColor: '#7C3AED',
  },
];

function formatQuotaMeta(format: ExportFormat): string {
  const q = getFormatQuota(format);
  if (format === 'txt') return 'Bez limitu';
  if (format === 'epub') {
    return q.allowed ? 'Bez limitu' : 'Tylko Pro';
  }
  // pdf
  if (q.unlimited) return 'Bez limitu';
  if ((q.remaining ?? 0) <= 0) return `Limit ${q.limit ?? FREE_PDF_MONTHLY_LIMIT}/mies.`;
  return `${q.remaining}/${q.limit} w tym miesiącu`;
}

export default function ExportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, isLoggedIn } = useAuth();
  const exportQuota = useExportQuota();
  const [book, setBook] = useState<Book | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyFormat, setBusyFormat] = useState<ExportFormat | null>(null);
  const [pendingFormat, setPendingFormat] = useState<ExportFormat | null>(null);
  const [lastExport, setLastExport] = useState<{
    format: ExportFormat;
    destination: ExportDestination;
    filename: string;
  } | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (isLoggedIn && user) {
        void refreshExportQuota(user.id);
        return;
      }
      void syncExportQuota({ userId: null, plan: 'guest' });
    }, [isLoggedIn, user?.id])
  );

  useEffect(() => {
    if (!id) return;
    void (async () => {
      try {
        const data = await getBook(id);
        setBook(data);
      } catch (error) {
        Alert.alert('Błąd', error instanceof Error ? error.message : 'Nie znaleziono książki.');
        router.back();
      } finally {
        setLoading(false);
      }
    })();
  }, [id, router]);

  const promptUpgrade = (format: ExportFormat, message: string) => {
    Alert.alert('Limit eksportu', message, [
      { text: 'Anuluj', style: 'cancel' },
      { text: 'Zobacz Pro', onPress: () => router.push('/subscribe') },
    ]);
  };

  const onPickFormat = (format: ExportFormat) => {
    if (!book || busyFormat || book.pages.length === 0) return;
    const q = exportQuota.byFormat[format];
    if (!q.allowed || (!q.unlimited && (q.remaining ?? 0) <= 0)) {
      if (format === 'epub') {
        promptUpgrade(
          format,
          'Eksport eBook jest dostępny w planie Pro. Na Free zostają TXT (bez limitu) i PDF (20 / miesiąc).'
        );
        return;
      }
      if (format === 'pdf') {
        promptUpgrade(
          format,
          `Darmowy plan: limit ${FREE_PDF_MONTHLY_LIMIT} eksportów PDF na miesiąc. W Pro PDF jest bez limitu.`
        );
        return;
      }
    }
    setPendingFormat(format);
  };

  const onDeliver = async (destination: ExportDestination) => {
    if (!book || !pendingFormat || busyFormat) return;
    const format = pendingFormat;
    setPendingFormat(null);
    setBusyFormat(format);
    try {
      const file = await buildExportFile(book, format);
      await deliverExportFile(book, file, destination);
      setLastExport({ format, destination, filename: file.filename });
      if (destination === 'save' && Platform.OS === 'android') {
        Alert.alert('Zapisano', `Plik ${file.filename} został zapisany na urządzeniu.`);
      }
    } catch (error) {
      if (error instanceof ExportCancelledError) return;
      if (error instanceof ExportAuthRequiredError) {
        Alert.alert('Wymagane logowanie', error.message, [
          { text: 'Anuluj', style: 'cancel' },
          { text: 'Zaloguj', onPress: () => router.push('/login') },
        ]);
        return;
      }
      if (error instanceof ExportQuotaExceededError || error instanceof ExportFormatLockedError) {
        promptUpgrade(format, error.message);
        return;
      }
      Alert.alert('Eksport', error instanceof Error ? error.message : 'Nie udało się wyeksportować.');
    } finally {
      setBusyFormat(null);
    }
  };

  if (loading || !book) {
    return <Loader label="Przygotowuję eksport…" />;
  }

  const pending = book.pages.filter((p) => p.ocrStatus === 'pending').length;
  const errors = book.pages.filter((p) => p.ocrStatus === 'error').length;
  const ready = book.pages.length - pending - errors;
  const exporting = busyFormat !== null;
  const noPages = book.pages.length === 0;
  const pendingOption = FORMATS.find((f) => f.id === pendingFormat);
  const pendingLabel = pendingOption?.title ?? '';

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom: Math.max(insets.bottom, space.lg) + space.xxl,
        }}>
        <FadeInUp>
          <Gradient
            colors={gradients.homeHero}
            angle={165}
            fallbackColor={colors.blue}
            style={[styles.hero, { paddingTop: insets.top + space.md }]}>
            <HomeHeroOrbs />

            <FadeInUp delay={40} distance={10}>
              <View style={styles.heroTop}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Wróć"
                  hitSlop={10}
                  onPress={() => router.back()}
                  style={({ pressed }) => [styles.heroBack, pressed && styles.pressed]}>
                  <Icon name="back" size={22} color={colors.white} />
                </Pressable>
                <View style={styles.pagesPill}>
                  <Icon name="notes" size={14} color={colors.primary} />
                  <Text style={styles.pagesPillText}>{pagesLabel(book.pages.length)}</Text>
                </View>
              </View>
            </FadeInUp>

            <FadeInUp delay={120} distance={16}>
              <Text style={styles.welcomeLine}>Export</Text>
              <Text style={styles.welcomeName} numberOfLines={2}>
                {book.title}
              </Text>
              <Text style={styles.welcomeHint}>
                Zapisz lub udostępnij wszystkie strony jako TXT, PDF albo eBook.
              </Text>
            </FadeInUp>
          </Gradient>

          <View style={styles.body}>
            <ScanQueueCard style={styles.queue} />
            <AiQueueCard style={styles.queue} />

            {pending > 0 ? (
              <View style={styles.warnBanner}>
                <Icon name="alert" size={16} color="#A96A05" />
                <Text style={styles.warnText}>
                  {pending} {pending === 1 ? 'strona czeka' : 'stron czeka'} na analizę — eksport może
                  być niepełny
                </Text>
              </View>
            ) : null}

            {exportQuota.byFormat.pdf.limit != null && !exportQuota.byFormat.pdf.unlimited ? (
              <View style={styles.infoBanner}>
                <Icon name="info" size={16} color={colors.primary} />
                <Text style={styles.infoText}>
                  PDF: pozostało {exportQuota.byFormat.pdf.remaining ?? 0} /{' '}
                  {exportQuota.byFormat.pdf.limit} w tym miesiącu
                </Text>
              </View>
            ) : null}

            <FadeInUp delay={180} distance={14}>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>Format</Text>
              </View>

              {noPages ? (
                <EmptyState
                  icon="export"
                  title="Brak stron do eksportu"
                  body="Zeskanuj strony książki, a potem wyeksportuj je jako TXT, PDF albo eBook."
                />
              ) : (
                <View style={styles.formatStack}>
                  {FORMATS.map((format) => {
                    const q = exportQuota.byFormat[format.id];
                    const locked = format.id === 'epub' && !q.allowed;
                    const exhausted =
                      format.id === 'pdf' && !q.unlimited && (q.remaining ?? 0) <= 0;
                    const showPro = locked;
                    const isBusy = busyFormat === format.id;
                    const dimmed = locked || exhausted;
                    return (
                      <Pressable
                        key={format.id}
                        accessibilityRole="button"
                        accessibilityLabel={format.title}
                        accessibilityState={{ disabled: exporting }}
                        disabled={exporting}
                        onPress={() => onPickFormat(format.id)}
                        style={({ pressed }) => [
                          styles.formatCard,
                          pressed && styles.formatCardPressed,
                          dimmed && styles.formatDisabled,
                        ]}>
                        <View style={[styles.formatIcon, { backgroundColor: format.tint }]}>
                          <Icon name={format.icon} size={20} color={format.iconColor} />
                        </View>
                        <View style={styles.formatText}>
                          <View style={styles.formatTitleRow}>
                            <Text style={styles.formatTitle}>{format.title}</Text>
                            {showPro ? (
                              <View style={styles.proBadge}>
                                <Text style={styles.proBadgeText}>Pro</Text>
                              </View>
                            ) : null}
                          </View>
                          <Text style={styles.formatDetail}>{format.detail}</Text>
                          <Text style={styles.formatMeta}>{formatQuotaMeta(format.id)}</Text>
                        </View>
                        {isBusy ? (
                          <Text style={styles.formatBusy}>…</Text>
                        ) : (
                          <Icon name="chevronRight" size={18} color={colors.faint} />
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </FadeInUp>

            <FadeInUp delay={260} distance={14}>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>Zawartość</Text>
              </View>

              <View style={styles.statGrid}>
                <StatCard
                  width={STAT_W}
                  icon="check"
                  tint="#DDF7F1"
                  iconColor="#10B981"
                  meta="Gotowy tekst"
                  label={String(ready)}
                />
                <StatCard
                  width={STAT_W}
                  icon="ai"
                  tint="#EDE9FE"
                  iconColor="#7C3AED"
                  meta="W analizie"
                  label={String(pending)}
                />
                <StatCard
                  width={STAT_W}
                  icon="notes"
                  tint="#E6EEFE"
                  iconColor="#3B82F6"
                  meta="Strony"
                  label={String(book.pages.length)}
                />
                <StatCard
                  width={STAT_W}
                  icon="alert"
                  tint={errors > 0 ? '#FDE8E6' : colors.surfaceMuted}
                  iconColor={errors > 0 ? '#E24B41' : colors.muted}
                  meta="Błędy odczytu"
                  label={String(errors)}
                />
              </View>
            </FadeInUp>

            {lastExport ? (
              <FadeInUp delay={80} distance={10}>
                <View style={styles.successCard}>
                  <View style={styles.successIcon}>
                    <Icon name="checkCircle" size={18} color="#0A8C77" />
                  </View>
                  <View style={styles.successText}>
                    <Text style={styles.successTitle}>
                      {lastExport.destination === 'save' ? 'Zapisano' : 'Udostępniono'}{' '}
                      {lastExport.format.toUpperCase()}
                    </Text>
                    <Text numberOfLines={1} style={styles.successMeta}>
                      {lastExport.filename}
                    </Text>
                  </View>
                </View>
              </FadeInUp>
            ) : null}
          </View>
        </FadeInUp>
      </ScrollView>

      <BusyOverlay
        visible={exporting}
        label={
          busyFormat === 'pdf'
            ? 'Generuję PDF…'
            : busyFormat === 'epub'
              ? 'Składam eBook…'
              : 'Przygotowuję plik…'
        }
      />

      <Sheet
        visible={pendingFormat !== null}
        onClose={() => setPendingFormat(null)}
        eyebrow="Export"
        title={pendingLabel ? `Eksport ${pendingLabel}` : 'Eksport'}>
        <Text style={styles.sheetBody}>
          {Platform.OS === 'android'
            ? 'Zapisz plik w wybranym folderze albo udostępnij go innej aplikacji.'
            : 'Zapisz w Plikach albo udostępnij — wybierz opcję poniżej.'}
        </Text>
        <SheetGroup>
          <Row
            icon="save"
            label="Zapisz na urządzenie"
            detail={Platform.OS === 'android' ? 'Wybierz folder' : 'Zapisz w Plikach'}
            tone="primary"
            chevron
            onPress={() => void onDeliver('save')}
          />
        </SheetGroup>
        <SheetGroup>
          <Row
            icon="share"
            label="Udostępnij"
            detail="Wyślij do innej aplikacji"
            chevron
            onPress={() => void onDeliver('share')}
          />
        </SheetGroup>
      </Sheet>
    </View>
  );
}

function StatCard({
  width,
  icon,
  tint,
  iconColor,
  meta,
  label,
}: {
  width: number;
  icon: IconName;
  tint: string;
  iconColor: string;
  meta: string;
  label: string;
}) {
  return (
    <View style={[styles.statCard, { width }]}>
      <View style={[styles.statIcon, { backgroundColor: tint }]}>
        <Icon name={icon} size={18} color={iconColor} />
      </View>
      <View style={styles.statText}>
        <Text style={styles.statMeta} numberOfLines={1}>
          {meta}
        </Text>
        <Text style={styles.statLabel} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  pressed: {
    opacity: 0.82,
  },
  hero: {
    overflow: 'hidden',
    paddingHorizontal: space.xl,
    paddingBottom: space.xxl,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.md,
  },
  heroBack: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  pagesPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 7,
    paddingHorizontal: 12,
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    ...shadow.soft,
  },
  pagesPillText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
    letterSpacing: -0.2,
  },
  welcomeLine: {
    fontSize: 22,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.92)',
    letterSpacing: -0.4,
    lineHeight: 26,
    marginBottom: 2,
  },
  welcomeName: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: -0.8,
    lineHeight: 32,
    marginBottom: space.sm,
  },
  welcomeHint: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.86)',
    lineHeight: 20,
    letterSpacing: -0.15,
    maxWidth: 320,
  },
  body: {
    paddingTop: space.xxl,
    paddingHorizontal: space.xl,
    gap: space.sm,
  },
  queue: {
    marginBottom: space.sm,
  },
  warnBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    padding: space.md,
    borderRadius: 16,
    backgroundColor: colors.warningSoft,
    marginBottom: space.sm,
  },
  warnText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#A96A05',
    lineHeight: 18,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: 16,
    backgroundColor: colors.primarySoft,
    marginBottom: space.sm,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: colors.primaryDeep,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.md,
    marginBottom: space.md,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.ink,
    letterSpacing: -0.4,
  },
  formatStack: {
    gap: space.md,
    marginBottom: space.lg,
  },
  formatCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.lg,
    paddingHorizontal: space.lg,
    backgroundColor: colors.surface,
    borderRadius: 18,
    ...shadow.soft,
  },
  formatCardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }],
  },
  formatDisabled: {
    opacity: 0.45,
  },
  formatIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formatText: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  formatTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  formatTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.ink,
    letterSpacing: -0.3,
  },
  formatDetail: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.muted,
    lineHeight: 18,
  },
  formatMeta: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: -0.1,
    marginTop: 2,
  },
  formatBusy: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.faint,
  },
  proBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  proBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primary,
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: CARD_GAP,
    marginBottom: space.lg,
  },
  statCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    backgroundColor: colors.surface,
    borderRadius: 18,
    ...shadow.soft,
  },
  statIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  statMeta: {
    fontSize: 11.5,
    fontWeight: '600',
    color: colors.muted,
    letterSpacing: -0.1,
  },
  statLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.ink,
    letterSpacing: -0.3,
  },
  successCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    backgroundColor: colors.successSoft,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(16, 191, 160, 0.22)',
  },
  successIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  successText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  successTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0A8C77',
    letterSpacing: -0.2,
  },
  successMeta: {
    fontSize: 12.5,
    fontWeight: '600',
    color: colors.inkSoft,
  },
  sheetBody: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.muted,
    lineHeight: 20,
    marginBottom: space.md,
    paddingHorizontal: 2,
  },
});
