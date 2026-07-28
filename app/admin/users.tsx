import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import * as api from '@/src/api/endpoints';
import type { ApiUser } from '@/src/api/types';
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

export default function AdminUsersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAdmin, ready } = useAuth();
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.fetchAdminUsers();
      setUsers(result.data);
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

  return (
    <View style={styles.root}>
      <AuroraBackdrop height={220} warm />
      <AppBar title="Users" subtitle="Subskrypcje ręczne" onBack={() => router.back()} />
      {loading ? (
        <Loader label="Ładuję użytkowników…" />
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + space.xl },
          ]}>
          {users.map((user, index) => (
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
                  tone="neutral"
                  icon="info"
                />
                {user.quota ? (
                  <Text style={styles.quota}>
                    AI: {user.quota.remaining}/{user.quota.limit} (
                    {user.quota.period_type === 'day' ? 'dzień' : 'miesiąc'})
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
          ))}
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
  card: { gap: space.sm },
  meta: {
    flexDirection: 'row',
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
