import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isApiConfigured } from '@/src/ai/config';
import * as api from '@/src/api/endpoints';
import { ApiError, type AiUsageItem } from '@/src/api/types';
import { useAuth } from '@/src/auth/AuthProvider';
import { FREE_OCR_MONTHLY_LIMIT, refreshOcrQuota, useOcrQuota } from '@/src/ocr/quota';
import {
  AppBar,
  AuroraBackdrop,
  Badge,
  Card,
  EmptyState,
  Loader,
  ProgressBar,
  colors,
  font,
  radius,
  shadow,
  space,
} from '@/src/ui';
import { pages as pagesLabel, relativeDate } from '@/src/utils/format';

function planLabel(plan: string | undefined): string {
  return plan === 'pro' ? 'Pro' : 'Darmowy';
}

function statusLabel(status: string): string {
  switch (status) {
    case 'done':
      return 'Gotowe';
    case 'partial':
      return 'Częściowo';
    case 'failed':
      return 'Błąd';
    case 'processing':
    case 'queued':
      return 'W toku';
    default:
      return status;
  }
}

function statusTone(status: string): 'success' | 'warning' | 'danger' | 'primary' | 'neutral' {
  switch (status) {
    case 'done':
      return 'success';
    case 'partial':
      return 'warning';
    case 'failed':
      return 'danger';
    case 'processing':
    case 'queued':
      return 'primary';
    default:
      return 'neutral';
  }
}

function usageDetail(item: AiUsageItem): string {
  const parts: string[] = [];
  if (item.completed > 0) parts.push(`${item.completed} OK`);
  if (item.failed > 0) parts.push(`${item.failed} błąd`);
  const pages = item.pages
    .map((p) => p.page_index)
    .filter((n): n is number => typeof n === 'number')
    .sort((a, b) => a - b);
  if (pages.length > 0) {
    const preview = pages.slice(0, 8).join(', ');
    parts.push(
      pages.length > 8 ? `strony ${preview}…` : `strony ${preview}`
    );
  }
  return parts.length > 0 ? parts.join(' · ') : pagesLabel(item.total);
}

export default function UsageScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, ready, isLoggedIn, refresh } = useAuth();
  const ocrQuota = useOcrQuota();

  const [items, setItems] = useState<AiUsageItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!ready) return;
    if (!isLoggedIn) {
      router.replace('/login');
      return;
    }
    if (!isApiConfigured()) {
      setLoading(false);
      Alert.alert('API', 'Brak EXPO_PUBLIC_API_BASE_URL w konfiguracji.');
      return;
    }

    setLoading(true);
    try {
      await refresh();
      await refreshOcrQuota();
      const result = await api.fetchAiUsage();
      setItems(result.data);
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : 'Nie udało się wczytać historii użycia.';
      Alert.alert('Użycie AI', message);
    } finally {
      setLoading(false);
    }
  }, [ready, isLoggedIn, refresh, router]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  if (!ready || (loading && items.length === 0)) {
    return <Loader label="Wczytywanie użycia…" />;
  }

  const quota = user?.quota;

  return (
    <View style={styles.root}>
      <AuroraBackdrop height={280} />
      <AppBar
        title="Użycie AI"
        subtitle={`Pakiet ${planLabel(user?.plan)}`}
        onBack={() => router.back()}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + space.xl },
        ]}>
        <Card style={styles.quotaCard}>
          <View style={styles.quotaTop}>
            <Text style={styles.quotaTitle}>OCR w tym miesiącu</Text>
            <Badge
              label={planLabel(user?.plan)}
              tone={user?.plan === 'pro' ? 'success' : 'primary'}
              icon={user?.plan === 'pro' ? 'bolt' : 'ai'}
            />
          </View>
          {ocrQuota.unlimited ? (
            <Text style={styles.quotaValue}>Nielimitowane</Text>
          ) : ocrQuota.loggedIn ? (
            <>
              <Text style={styles.quotaValue}>
                {ocrQuota.remaining} z {ocrQuota.limit ?? FREE_OCR_MONTHLY_LIMIT} odczytów
              </Text>
              <Text style={styles.quotaHint}>
                {ocrQuota.used} zużyte
                {ocrQuota.reserved > 0 ? ` · ${ocrQuota.reserved} zarezerwowane` : ''}
                {' · '}
                zdjęcia bez limitu · limit odnawia się co miesiąc
              </Text>
              <ProgressBar
                value={
                  ocrQuota.limit != null && ocrQuota.limit > 0
                    ? Math.max(0, Math.min(1, (ocrQuota.used + ocrQuota.reserved) / ocrQuota.limit))
                    : 0
                }
                height={6}
                style={styles.quotaBar}
              />
            </>
          ) : (
            <Text style={styles.quotaHint}>OCR dostępne po zalogowaniu.</Text>
          )}
        </Card>

        <Card style={styles.quotaCard}>
          <View style={styles.quotaTop}>
            <Text style={styles.quotaTitle}>Limit AI w okresie</Text>
            <Badge
              label={planLabel(user?.plan)}
              tone={user?.plan === 'pro' ? 'success' : 'primary'}
              icon={user?.plan === 'pro' ? 'bolt' : 'ai'}
            />
          </View>
          {quota ? (
            <>
              <Text style={styles.quotaValue}>
                {quota.remaining} z {quota.limit} stron
              </Text>
              <Text style={styles.quotaHint}>
                {quota.used} zużyte
                {quota.reserved > 0 ? ` · ${quota.reserved} zarezerwowane` : ''}
                {' · '}
                / {quota.period_type === 'day' ? 'dzień' : 'miesiąc'}
              </Text>
              <ProgressBar
                value={
                  quota.limit > 0
                    ? Math.max(0, Math.min(1, (quota.limit - quota.remaining) / quota.limit))
                    : 0
                }
                height={6}
                style={styles.quotaBar}
              />
            </>
          ) : (
            <Text style={styles.quotaHint}>Brak danych limitu.</Text>
          )}
        </Card>

        <Text style={styles.sectionTitle}>Historia analiz</Text>
        <Text style={styles.sectionHint}>Kiedy i które strony zostały poprawione przez AI.</Text>

        {items.length === 0 ? (
          <EmptyState
            icon="ai"
            title="Brak analiz"
            body="Tu pojawią się Twoje uruchomienia AI — tytuł książki, czas i strony."
          />
        ) : (
          <View style={styles.list}>
            {items.map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={`${item.book_title ?? 'Książka'}, ${statusLabel(item.status)}`}
                disabled={!item.book_local_id}
                onPress={() => {
                  if (item.book_local_id) {
                    router.push(`/book/${item.book_local_id}`);
                  }
                }}
                style={({ pressed }) => [
                  styles.item,
                  pressed && item.book_local_id ? styles.itemPressed : null,
                ]}>
                <View style={styles.itemTop}>
                  <Text numberOfLines={2} style={styles.itemTitle}>
                    {item.book_title?.trim() || 'Bez tytułu'}
                  </Text>
                  <Badge label={statusLabel(item.status)} tone={statusTone(item.status)} />
                </View>
                <Text style={styles.itemWhen}>
                  {item.created_at ? relativeDate(item.created_at) : '—'}
                  {' · '}
                  {pagesLabel(item.total)}
                </Text>
                <Text numberOfLines={2} style={styles.itemDetail}>
                  {usageDetail(item)}
                </Text>
              </Pressable>
            ))}
          </View>
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
  content: {
    paddingHorizontal: space.lg,
    gap: space.md,
  },
  quotaCard: {
    gap: space.sm,
  },
  quotaTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  quotaTitle: {
    ...font.label,
    color: colors.muted,
  },
  quotaValue: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.ink,
    letterSpacing: -0.6,
    fontVariant: ['tabular-nums'],
  },
  quotaHint: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
  },
  quotaBar: {
    marginTop: 4,
  },
  sectionTitle: {
    ...font.h3,
    marginTop: space.sm,
  },
  sectionHint: {
    ...font.small,
    marginTop: -space.sm,
  },
  list: {
    gap: space.md,
  },
  item: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.lg,
    gap: 6,
    ...shadow.soft,
  },
  itemPressed: {
    backgroundColor: colors.surfaceMuted,
    transform: [{ scale: 0.99 }],
  },
  itemTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
  },
  itemTitle: {
    ...font.h3,
    fontSize: 16,
    flex: 1,
  },
  itemWhen: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.inkSoft,
    letterSpacing: -0.1,
  },
  itemDetail: {
    fontSize: 12.5,
    fontWeight: '600',
    color: colors.muted,
    lineHeight: 18,
  },
});
