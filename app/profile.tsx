import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
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
import {
  AppBar,
  AuroraBackdrop,
  Button,
  Card,
  Divider,
  Row,
  SectionHeader,
  TextField,
  colors,
  font,
  space,
} from '@/src/ui';

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, ready, isLoggedIn, isAdmin, refresh, signOut } = useAuth();

  const [name, setName] = useState('');
  const [savingName, setSavingName] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

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
      <AuroraBackdrop height={240} warm />
      <AppBar title="Profil" subtitle={user?.email} onBack={() => router.back()} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + space.xl },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <SectionHeader title="Nazwa" />
          <Text style={styles.hint}>Widoczna w aplikacji przy Twoim koncie.</Text>
          <TextField
            label="Nazwa"
            icon="edit"
            value={name}
            onChangeText={setName}
            placeholder="Jak się nazywasz?"
            autoComplete="name"
            textContentType="name"
            returnKeyType="done"
            onSubmitEditing={() => void onSaveName()}
          />
          <Button
            label="Zapisz nazwę"
            loading={savingName}
            onPress={() => void onSaveName()}
          />

          <SectionHeader title="Hasło" />
          <Text style={styles.hint}>Zmiana wymaga podania obecnego hasła.</Text>
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
            loading={savingPassword}
            onPress={() => void onChangePassword()}
          />

          <SectionHeader title="Konto" />
          <Card padded={false}>
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
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  flex: { flex: 1 },
  content: {
    paddingHorizontal: space.lg,
    gap: space.md,
  },
  hint: {
    ...font.small,
    color: colors.muted,
    marginTop: -space.sm,
  },
});
