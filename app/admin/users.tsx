import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatUsd } from '@/src/ai/pricing';
import * as api from '@/src/api/endpoints';
import type { AdminUsersMeta, ApiUser } from '@/src/api/types';
import { ApiError } from '@/src/api/types';
import { useAuth } from '@/src/auth/AuthProvider';
import {
  AppBar,
  AuroraBackdrop,
  Badge,
  Card,
  Divider,
  Loader,
  Row,
  colors,
  font,
  radius,
  space,
} from '@/src/ui';
import { formatAiTokens, formatAiTokensPrecise } from '@/src/utils/format';

function formatApiTokens(value: number): string {
  return value.toLocaleString('pl-PL');
}

function TokenStatRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

export default function AdminUsersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAdmin, ready } = useAuth();
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [meta, setMeta] = useState<AdminUsersMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.fetchAdminUsers();
      setUsers(result.data);
      setMeta(result.meta);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Nie udało się pobrać użytkowników.';
      Alert.alert('Users', message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!ready) return;
      if (!isAdmin) {
        router.replace('/');
        return;
      }
      void load();
    }, [ready, isAdmin, load, router])
  );

  const setPlan = async (user: ApiUser, plan: 'free' | 'pro') => {
    if (user.plan === plan) return;
    setBusyId(user.id);
    try {
      const updated = await api.updateAdminUserPlan(user.id, plan);
      setUsers((prev) => prev.map((u) => (u.id === user.id ? updated : u)));
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Nie udało się zmienić planu.';
      Alert.alert('Plan', message);
    } finally {
      setBusyId(null);
    }
  };

  const totals = meta?.totals;
  const modelLabel = meta ? `${meta.ai_provider} · ${meta.ai_model}` : null;

  return (
    <View style={styles.root}>
      <AuroraBackdrop height={220} warm />
      <AppBar
        title="Users"
        subtitle={modelLabel ?? 'Zużycie tokenów AI'}
        onBack={() => router.back()}
      />
      {loading ? (
        <Loader label="Ładuję użytkowników…" />
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + space.xl },
          ]}>
          {meta && totals ? (
            <Card style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Podsumowanie · {meta.ai_model}</Text>
              <Text style={styles.summaryHint}>
                Cennik: wejście {formatUsd(meta.pricing.input_usd_per_1m)}/1M · wyjście{' '}
                {formatUsd(meta.pricing.output_usd_per_1m)}/1M
              </Text>
              <View style={styles.statsGrid}>
                <TokenStatRow
                  label="Tokeny wejścia"
                  value={formatApiTokens(totals.prompt_tokens)}
                />
                <TokenStatRow
                  label="Tokeny wyjścia"
                  value={formatApiTokens(totals.output_tokens)}
                />
                <TokenStatRow label="Łącznie API" value={formatApiTokens(totals.total_tokens)} />
                <TokenStatRow
                  label="Tokeny platformy"
                  value={formatAiTokensPrecise(totals.user_tokens)}
                />
                <TokenStatRow label="Koszt wejścia" value={formatUsd(totals.cost_input_usd)} />
                <TokenStatRow label="Koszt wyjścia" value={formatUsd(totals.cost_output_usd)} />
                <TokenStatRow label="Koszt łącznie" value={formatUsd(totals.cost_usd)} />
                <TokenStatRow label="Analizy AI" value={String(totals.jobs_done)} />
              </View>
            </Card>
          ) : null}

          {users.map((user, index) => {
            const stats = user.token_stats;
            return (
              <Card key={user.id} style={styles.card}>
                <Row
                  icon="shield"
                  label={user.name}
                  detail={user.email}
                  value={user.plan === 'pro' ? 'Pro' : 'Free'}
                />
                <View style={styles.meta}>
                  <Badge
                    label={user.roles.includes('admin') ? 'admin' : 'user'}
                    tone={user.roles.includes('admin') ? 'primary' : 'neutral'}
                    icon="info"
                  />
                  {user.quota ? (
                    <Text style={styles.quota}>
                      AI: {formatAiTokens(user.quota.remaining)}/
                      {formatAiTokens(user.quota.limit)} tok. (
                      {user.quota.period_type === 'day' ? 'dzień' : 'miesiąc'})
                    </Text>
                  ) : null}
                </View>

                {stats ? (
                  <View style={styles.userStats}>
                    <Text style={styles.userStatsTitle}>Zużycie AI (wszystkie analizy)</Text>
                    <View style={styles.statsGrid}>
                      <TokenStatRow
                        label="Wejście"
                        value={formatApiTokens(stats.prompt_tokens)}
                      />
                      <TokenStatRow
                        label="Wyjście"
                        value={formatApiTokens(stats.output_tokens)}
                      />
                      <TokenStatRow
                        label="Platforma"
                        value={formatAiTokensPrecise(stats.user_tokens)}
                      />
                      <TokenStatRow label="Koszt" value={formatUsd(stats.cost_usd)} />
                      <TokenStatRow label="Strony AI" value={String(stats.jobs_done)} />
                    </View>
                  </View>
                ) : null}

                <View style={styles.meta}>
                  {user.ocr_quota ? (
                    <Text style={styles.quota}>
                      OCR:{' '}
                      {user.ocr_quota.unlimited
                        ? '∞'
                        : `${user.ocr_quota.remaining}/${user.ocr_quota.limit}`}{' '}
                      / miesiąc
                    </Text>
                  ) : null}
                  {user.photo_quota ? (
                    <Text style={styles.quota}>
                      Zdjęcia:{' '}
                      {user.photo_quota.unlimited
                        ? '∞'
                        : `${user.photo_quota.remaining}/${user.photo_quota.limit}`}{' '}
                      / miesiąc
                    </Text>
                  ) : null}
                  {user.book_quota ? (
                    <Text style={styles.quota}>
                      Książki:{' '}
                      {user.book_quota.unlimited
                        ? '∞'
                        : `${user.book_quota.used}/${user.book_quota.limit}`}
                    </Text>
                  ) : null}
                </View>
                <Divider />
                <View style={styles.actions}>
                  <Pressable
                    disabled={busyId === user.id}
                    onPress={() => void setPlan(user, 'free')}
                    style={[styles.planBtn, user.plan === 'free' && styles.planBtnActive]}>
                    <Text style={styles.planLabel}>Free</Text>
                  </Pressable>
                  <Pressable
                    disabled={busyId === user.id}
                    onPress={() => void setPlan(user, 'pro')}
                    style={[styles.planBtn, user.plan === 'pro' && styles.planBtnActive]}>
                    <Text style={styles.planLabel}>Pro</Text>
                  </Pressable>
                </View>
                {index < users.length - 1 ? <View style={{ height: space.sm }} /> : null}
              </Card>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  content: {
    paddingHorizontal: space.lg,
    gap: space.md,
    paddingTop: space.md,
  },
  summaryCard: {
    gap: space.sm,
    paddingBottom: space.md,
  },
  summaryTitle: {
    ...font.subtitle,
    color: colors.ink,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
  },
  summaryHint: {
    fontSize: 12.5,
    color: colors.muted,
    fontWeight: '600',
    paddingHorizontal: space.lg,
  },
  card: { gap: space.sm },
  meta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
  },
  quota: {
    fontSize: 12.5,
    color: colors.muted,
    fontWeight: '600',
  },
  userStats: {
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
    gap: space.xs,
  },
  userStatsTitle: {
    fontSize: 12.5,
    color: colors.inkSoft,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  statsGrid: {
    gap: 6,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.md,
  },
  statLabel: {
    fontSize: 13,
    color: colors.muted,
    fontWeight: '600',
    flex: 1,
  },
  statValue: {
    fontSize: 13,
    color: colors.ink,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  actions: {
    flexDirection: 'row',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
  },
  planBtn: {
    flex: 1,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingVertical: 10,
    alignItems: 'center',
  },
  planBtnActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  planLabel: {
    ...font.caption,
    color: colors.ink,
    fontWeight: '700',
  },
});
