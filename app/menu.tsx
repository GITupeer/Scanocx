import Constants from 'expo-constants';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { BookSummary } from '@/src/domain/types';
import { useAuth } from '@/src/auth/AuthProvider';
import { useOcrQueue } from '@/src/ocr/queue';
import { listBooks } from '@/src/storage/books';
import {
  AuroraBackdrop,
  Badge,
  BottomNav,
  Card,
  Divider,
  FadeInUp,
  Gradient,
  Icon,
  Row,
  ScanQueueCard,
  SectionHeader,
  colors,
  font,
  gradients,
  radius,
  shadow,
  space,
  useBottomNavInset,
} from '@/src/ui';
import { pages as pagesLabel } from '@/src/utils/format';

const VERSION = Constants.expoConfig?.version ?? '1.0.0';

function planLabel(plan: string | undefined): string {
  return plan === 'pro' ? 'Pro' : 'Darmowy';
}

function quotaLabel(user: ReturnType<typeof useAuth>['user']): string {
  const q = user?.quota;
  if (!q) return 'Brak danych limitu';
  const period = q.period_type === 'day' ? 'dzień' : 'miesiąc';
  return `${q.remaining} z ${q.limit} stron AI / ${period}`;
}

export default function MenuScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomInset = useBottomNavInset();
  const queue = useOcrQueue();
  const { user, isLoggedIn, isAdmin, signOut, refresh, ready } = useAuth();
  const [books, setBooks] = useState<BookSummary[]>([]);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        setBooks(await listBooks());
        if (ready && isLoggedIn) {
          await refresh();
        }
      })();
    }, [ready, isLoggedIn, refresh])
  );

  const totalPages = books.reduce((sum, book) => sum + book.pageCount, 0);

  const onSignOut = () => {
    Alert.alert('Wyloguj', 'Na pewno chcesz się wylogować?', [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Wyloguj',
        style: 'destructive',
        onPress: () => {
          void signOut();
        },
      },
    ]);
  };

  return (
    <View style={styles.root}>
      <AuroraBackdrop height={360} warm />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + space.lg, paddingBottom: bottomInset + space.xl },
        ]}>
        <FadeInUp>
          <Text style={styles.screenTitle}>Menu</Text>

          <Gradient colors={gradients.brandVivid} style={styles.hero}>
            <View style={styles.heroMark}>
              <Icon name="ai" size={24} color={colors.white} />
            </View>
            <Text style={styles.heroTitle}>Scanocx</Text>
            <Text style={styles.heroBody}>
              Skanowanie i OCR lokalnie. Korekta AI w chmurze — po zalogowaniu.
            </Text>
            <View style={styles.heroChips}>
              <Badge label={`wersja ${VERSION}`} tone="glass" icon="info" />
              <Badge
                label={isLoggedIn ? planLabel(user?.plan) : 'offline OCR'}
                tone="glass"
                icon="shield"
              />
            </View>
          </Gradient>
        </FadeInUp>

        <ScanQueueCard />

        <SectionHeader title="Konto" />
        <Card padded={false}>
          {isLoggedIn && user ? (
            <>
              <Row icon="shield" label={user.name} detail={user.email} value={planLabel(user.plan)} />
              <Divider inset={space.lg + 36 + space.md} />
              <Row
                icon="ai"
                label="Limit AI"
                detail={quotaLabel(user)}
                value={String(user.quota?.remaining ?? '—')}
              />
              <Divider inset={space.lg + 36 + space.md} />
              {isAdmin ? (
                <>
                  <Row
                    icon="settings"
                    label="Users"
                    detail="Zarządzanie planami użytkowników"
                    tone="primary"
                    chevron
                    onPress={() => router.push('/admin/users')}
                  />
                  <Divider inset={space.lg + 36 + space.md} />
                </>
              ) : null}
              <Row
                icon="lock"
                label="Wyloguj"
                detail="Wymaga ponownego logowania do AI"
                tone="primary"
                onPress={onSignOut}
              />
            </>
          ) : (
            <>
              <Row
                icon="lock"
                label="Zaloguj się"
                detail="Wymagane do korekty AI w chmurze"
                tone="primary"
                chevron
                onPress={() => router.push('/login')}
              />
              <Divider inset={space.lg + 36 + space.md} />
              <Row
                icon="plus"
                label="Załóż konto"
                detail="Darmowy plan: 3 strony AI / dzień"
                chevron
                onPress={() => router.push('/register')}
              />
            </>
          )}
        </Card>

        <SectionHeader title="Twoje dane" />
        <Card padded={false}>
          <Row
            icon="library"
            label="Książki"
            detail="Zapisane lokalnie na urządzeniu"
            value={String(books.length)}
          />
          <Divider inset={space.lg + 36 + space.md} />
          <Row icon="notes" label="Strony" detail={pagesLabel(totalPages)} value={String(totalPages)} />
          <Divider inset={space.lg + 36 + space.md} />
          <Row
            icon="ai"
            label="Kolejka OCR"
            detail={
              queue.total === 0
                ? 'Nic nie czeka na OCR'
                : queue.paused
                  ? 'Wstrzymana — trwa sesja zdjęć'
                  : `Rozpoznano ${Math.min(queue.completed, queue.total)} z ${queue.total}`
            }
            value={queue.remaining > 0 ? String(queue.remaining) : '0'}
          />
          <Divider inset={space.lg + 36 + space.md} />
          <Row
            icon="library"
            label="Przejdź do biblioteki"
            tone="primary"
            chevron
            onPress={() => router.replace('/')}
          />
        </Card>

        <SectionHeader title="Jak to działa" />
        <Card padded={false}>
          <Row
            icon="camera"
            label="1 · Zdjęcia stron"
            detail="Ramka prowadząca kadruje stronę i przycina zdjęcie automatycznie."
          />
          <Divider inset={space.lg + 36 + space.md} />
          <Row
            icon="ai"
            label="2 · OCR lokalnie"
            detail="OCR działa w tle na urządzeniu. AI startuje dopiero na Twoje żądanie."
          />
          <Divider inset={space.lg + 36 + space.md} />
          <Row
            icon="pdf"
            label="3 · Eksport"
            detail="Gotowy tekst udostępniasz jako PDF albo zwykły tekst."
          />
        </Card>

        <SectionHeader title="Prywatność" />
        <Card padded={false}>
          <Row
            icon="shield"
            label="Zdjęcia lokalnie"
            detail="JPEG-y nigdy nie są wysyłane. Do chmury trafia tylko tekst OCR przy AI."
          />
          <Divider inset={space.lg + 36 + space.md} />
          <Row
            icon="lock"
            label="Konto opcjonalne"
            detail="Logowanie jest wymagane wyłącznie do korekty AI."
          />
          <Divider inset={space.lg + 36 + space.md} />
          <Row
            icon="storage"
            label="Uprawnienia"
            detail="Kamera i galeria — tylko do zapisu stron książki."
          />
        </Card>

        <Text style={styles.footer}>Scanocx {VERSION}</Text>
      </ScrollView>

      <BottomNav
        active="menu"
        onScan={() => router.replace({ pathname: '/', params: { scan: '1' } })}
        scanBadge={queue.remaining}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  content: {
    paddingHorizontal: space.lg,
    gap: space.md,
  },
  screenTitle: {
    ...font.h1,
    marginBottom: space.lg,
  },
  hero: {
    borderRadius: radius.xxl,
    padding: space.xl,
    gap: space.sm,
    ...shadow.card,
  },
  heroMark: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    marginBottom: space.sm,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: -0.6,
  },
  heroBody: {
    fontSize: 14,
    lineHeight: 21,
    color: 'rgba(255,255,255,0.86)',
    fontWeight: '500',
  },
  heroChips: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.sm,
  },
  footer: {
    ...font.small,
    textAlign: 'center',
    marginTop: space.lg,
    marginBottom: space.sm,
  },
});
