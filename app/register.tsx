import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
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
import { ApiError } from '@/src/api/types';
import { useAuth } from '@/src/auth/AuthProvider';
import { AuroraBackdrop, Button, TextField, colors, font, space } from '@/src/ui';
import {
  FREE_AI_MONTHLY_LIMIT,
  FREE_BOOK_LIMIT,
  FREE_OCR_MONTHLY_LIMIT,
  FREE_PHOTO_MONTHLY_LIMIT,
  PRO_OCR_MONTHLY_LIMIT,
} from '@/src/plans/features';

export default function RegisterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signUp } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    if (!isApiConfigured()) {
      Alert.alert('API', 'Brak EXPO_PUBLIC_API_BASE_URL w konfiguracji.');
      return;
    }
    if (!name.trim() || !email.trim() || !password) {
      Alert.alert('Rejestracja', 'Uzupełnij wszystkie pola.');
      return;
    }
    if (password !== password2) {
      Alert.alert('Rejestracja', 'Hasła nie są takie same.');
      return;
    }
    setLoading(true);
    try {
      await signUp(name.trim(), email.trim(), password);
      router.replace('/');
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Nie udało się zarejestrować.';
      Alert.alert('Rejestracja', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <AuroraBackdrop height={280} warm />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + space.xl },
          ]}
          keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Załóż konto</Text>
          <Text style={styles.subtitle}>
            Po rejestracji: {FREE_BOOK_LIMIT} książki · {FREE_OCR_MONTHLY_LIMIT} OCR / miesiąc ·{' '}
            {FREE_PHOTO_MONTHLY_LIMIT} zdjęć / miesiąc ·{' '}
            {FREE_AI_MONTHLY_LIMIT} tokenów AI / miesiąc. Pro = bez limitu książek,{' '}
            {PRO_OCR_MONTHLY_LIMIT.toLocaleString('pl-PL')} OCR i nielimitowane zdjęcia.
          </Text>

          <TextField
            label="Imię"
            icon="edit"
            value={name}
            onChangeText={setName}
            placeholder="Jak się nazywasz?"
            autoComplete="name"
            textContentType="name"
          />
          <TextField
            label="Email"
            icon="info"
            value={email}
            onChangeText={setEmail}
            placeholder="ty@email.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
          />
          <TextField
            label="Hasło"
            icon="lock"
            value={password}
            onChangeText={setPassword}
            placeholder="min. 8 znaków"
            secureTextEntry
            autoCapitalize="none"
            textContentType="newPassword"
          />
          <TextField
            label="Powtórz hasło"
            icon="lock"
            value={password2}
            onChangeText={setPassword2}
            placeholder="••••••••"
            secureTextEntry
            autoCapitalize="none"
            textContentType="newPassword"
            onSubmitEditing={() => void onSubmit()}
          />

          <Button label="Zarejestruj" loading={loading} onPress={() => void onSubmit()} />

          <Text style={styles.footer}>
            Masz już konto?{' '}
            <Link href="/login" style={styles.link}>
              Zaloguj się
            </Link>
          </Text>
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
  title: { ...font.h1 },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
    marginBottom: space.sm,
  },
  link: {
    color: colors.primaryDeep,
    fontWeight: '700',
    fontSize: 13.5,
  },
  footer: {
    textAlign: 'center',
    color: colors.muted,
    marginTop: space.md,
    fontSize: 14,
  },
});
