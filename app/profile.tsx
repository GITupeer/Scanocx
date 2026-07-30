import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isApiConfigured } from '@/src/ai/config';
import * as api from '@/src/api/endpoints';
import { ApiError } from '@/src/api/types';
import { useAuth } from '@/src/auth/AuthProvider';
import { useOcrQueue } from '@/src/ocr/queue';
import {
  BottomNav,
  Button,
  Divider,
  FadeInUp,
  Gradient,
  HomeHeroOrbs,
  Icon,
  Row,
  TextField,
  colors,
  gradients,
  radius,
  shadow,
  space,
  useBottomNavInset,
} from '@/src/ui';

function planLabel(plan: string | undefined): string {
  return plan === 'pro' ? 'Pro' : 'Darmowy';
}

function userInitials(name: string | undefined, email: string | undefined): string {
  const source = name?.trim() || email?.trim() || '?';
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomInset = useBottomNavInset();
  const queue = useOcrQueue();
  const { user, ready, isLoggedIn, isAdmin, refresh, signOut } = useAuth();

  const [name, setName] = useState('');
  const [savingName, setSavingName] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const isPro = user?.plan === 'pro';

  useEffect(() => {
    if (!ready) return;
    if (!isLoggedIn) {
      router.replace('/login');
      return;
    }
    if (user?.name) {
      setName(user.name);
    }
  }, [ready, isLoggedIn, user?.name, router]);

  const onSaveName = async () => {
    if (!isApiConfigured()) {
      Alert.alert('API', 'Brak EXPO_PUBLIC_API_BASE_URL w konfiguracji.');
      return;
    }
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert('Profil', 'Podaj nazwę.');
      return;
    }
    if (trimmed === user?.name) {
      Alert.alert('Profil', 'Nazwa nie uległa zmianie.');
      return;
    }
    setSavingName(true);
    try {
      await api.updateProfile({ name: trimmed });
      await refresh();
      Alert.alert('Profil', 'Nazwa została zapisana.');
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Nie udało się zapisać nazwy.';
      Alert.alert('Profil', message);
    } finally {
      setSavingName(false);
    }
  };

  const onSignOut = () => {
    Alert.alert('Wyloguj', 'Na pewno chcesz się wylogować?', [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Wyloguj',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            await signOut();
            router.replace('/');
          })();
        },
      },
    ]);
  };

  const onChangePassword = async () => {
    if (!isApiConfigured()) {
      Alert.alert('API', 'Brak EXPO_PUBLIC_API_BASE_URL w konfiguracji.');
      return;
    }
    if (!currentPassword || !password) {
      Alert.alert('Hasło', 'Uzupełnij wszystkie pola.');
      return;
    }
    if (password !== password2) {
      Alert.alert('Hasło', 'Nowe hasła nie są takie same.');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Hasło', 'Nowe hasło musi mieć co najmniej 8 znaków.');
      return;
    }
    setSavingPassword(true);
    try {
      const result = await api.changePassword({
        current_password: currentPassword,
        password,
        password_confirmation: password2,
      });
      setCurrentPassword('');
      setPassword('');
      setPassword2('');
      Alert.alert('Hasło', result.message);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Nie udało się zmienić hasła.';
      Alert.alert('Hasło', message);
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <View style={styles.root}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: bottomInset + space.xl }}>
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
                    style={({ pressed }) => [styles.heroIconBtn, pressed && styles.pressed]}>
                    <Icon name="back" size={22} color={colors.white} />
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Plan ${planLabel(user?.plan)}`}
                    onPress={() => router.push((isPro ? '/usage' : '/subscribe') as Href)}
                    style={({ pressed }) => [styles.planPill, pressed && styles.pressed]}>
                    <View style={styles.planAvatar}>
                      <Text style={styles.planAvatarText}>
                        {userInitials(user?.name, user?.email)}
                      </Text>
                    </View>
                    <Text style={styles.planLabel} numberOfLines={1}>
                      {planLabel(user?.plan)}
                    </Text>
                    <Icon name="chevronRight" size={14} color={colors.inkSoft} />
                  </Pressable>
                </View>
              </FadeInUp>

              <FadeInUp delay={120} distance={16}>
                <Text style={styles.welcomeLine}>Profil</Text>
                <Text style={styles.welcomeName} numberOfLines={1}>
                  {user?.name?.trim() || 'Bez nazwy'}
                </Text>
                <Text style={styles.welcomeEmail} numberOfLines={1}>
                  {user?.email}
                </Text>
              </FadeInUp>
            </Gradient>
          </FadeInUp>

          <View style={styles.body}>
            <FadeInUp delay={180} distance={14}>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>Dane</Text>
              </View>
              <View style={styles.panel}>
                <TextField
                  label="Nazwa"
                  icon="user"
                  value={name}
                  onChangeText={setName}
                  placeholder="Jak się nazywasz?"
                  autoComplete="name"
                  textContentType="name"
                  returnKeyType="done"
                  onSubmitEditing={() => void onSaveName()}
                />
                <Button
                  label="Zapisz"
                  variant="soft"
                  loading={savingName}
                  onPress={() => void onSaveName()}
                />
              </View>
            </FadeInUp>

            <FadeInUp delay={240} distance={14}>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>Hasło</Text>
              </View>
              <View style={styles.panel}>
                <TextField
                  label="Obecne hasło"
                  icon="lock"
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  placeholder="••••••••"
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete="password"
                  textContentType="password"
                />
                <TextField
                  label="Nowe hasło"
                  icon="lock"
                  value={password}
                  onChangeText={setPassword}
                  placeholder="min. 8 znaków"
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete="password-new"
                  textContentType="newPassword"
                />
                <TextField
                  label="Powtórz nowe hasło"
                  icon="lock"
                  value={password2}
                  onChangeText={setPassword2}
                  placeholder="••••••••"
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete="password-new"
                  textContentType="newPassword"
                  returnKeyType="done"
                  onSubmitEditing={() => void onChangePassword()}
                />
                <Button
                  label="Zmień hasło"
                  variant="soft"
                  loading={savingPassword}
                  onPress={() => void onChangePassword()}
                />
              </View>
            </FadeInUp>

            <FadeInUp delay={300} distance={14}>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>Konto</Text>
              </View>
              <View style={[styles.panel, styles.panelFlush]}>
                {!isPro ? (
                  <>
                    <Row
                      icon="bolt"
                      label="Przejdź na Pro"
                      detail="Więcej AI i nielimitowane OCR"
                      tone="primary"
                      chevron
                      onPress={() => router.push('/subscribe')}
                    />
                    <Divider inset={space.lg + 36 + space.md} />
                  </>
                ) : null}
                <Row
                  icon="stats"
                  label="Użycie AI i OCR"
                  detail="Limity i historia"
                  chevron
                  onPress={() => router.push('/usage')}
                />
                <Divider inset={space.lg + 36 + space.md} />
                <Row
                  icon="scan"
                  label="Test preprocess / OCR"
                  detail="UVDoc · enhance · ML Kit"
                  chevron
                  onPress={() => router.push('/dev/dewarp')}
                />
                {isAdmin ? (
                  <>
                    <Divider inset={space.lg + 36 + space.md} />
                    <Row
                      icon="settings"
                      label="Panel admina"
                      detail="Zarządzanie planami"
                      tone="primary"
                      chevron
                      onPress={() => router.push('/admin/users')}
                    />
                  </>
                ) : null}
                <Divider inset={space.lg + 36 + space.md} />
                <Row icon="close" label="Wyloguj" tone="danger" onPress={onSignOut} />
              </View>
            </FadeInUp>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <BottomNav
        active="profile"
        onScan={() => router.push('/?scan=1' as Href)}
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
  flex: {
    flex: 1,
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
    marginBottom: space.xl,
  },
  heroIconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: 160,
    paddingVertical: 5,
    paddingLeft: 5,
    paddingRight: 12,
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    ...shadow.soft,
  },
  planAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  planAvatarText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: -0.2,
  },
  planLabel: {
    flexShrink: 1,
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
    fontSize: 30,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: -0.8,
    lineHeight: 34,
    marginBottom: 4,
  },
  welcomeEmail: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.78)',
    letterSpacing: -0.2,
  },
  body: {
    paddingTop: space.xxl,
    paddingHorizontal: space.xl,
    gap: space.sm,
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
  panel: {
    gap: space.md,
    padding: space.lg,
    backgroundColor: colors.surface,
    borderRadius: 18,
    marginBottom: space.sm,
    ...shadow.soft,
  },
  panelFlush: {
    gap: 0,
    padding: 0,
    overflow: 'hidden',
  },
});
