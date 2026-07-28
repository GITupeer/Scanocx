import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
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

import { useAuth } from '@/src/auth/AuthProvider';
import { ApiError } from '@/src/api/types';
import { isApiConfigured } from '@/src/ai/config';
import {
  AuroraBackdrop,
  Button,
  TextField,
  colors,
  font,
  space,
} from '@/src/ui';

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    if (!isApiConfigured()) {
      Alert.alert('API', 'Brak EXPO_PUBLIC_API_BASE_URL w konfiguracji.');
      return;
    }
    if (!email.trim() || !password) {
      Alert.alert('Logowanie', 'Podaj email i hasło.');
      return;
    }
    setLoading(true);
    try {
      await signIn(email.trim(), password);
      router.replace('/');
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Nie udało się zalogować.';
      Alert.alert('Logowanie', message);
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
          <Text style={styles.title}>Zaloguj się</Text>
          <Text style={styles.subtitle}>Analiza AI wymaga konta Scanocx.</Text>

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
            returnKeyType="next"
          />
          <TextField
            label="Hasło"
            icon="lock"
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            secureTextEntry
            autoCapitalize="none"
            autoComplete="password"
            textContentType="password"
            returnKeyType="done"
            onSubmitEditing={() => void onSubmit()}
          />

          <Pressable onPress={() => router.push('/forgot-password')} style={styles.linkWrap}>
            <Text style={styles.link}>Nie pamiętam hasła</Text>
          </Pressable>

          <Button label="Zaloguj" loading={loading} onPress={() => void onSubmit()} />

          <Text style={styles.footer}>
            Nie masz konta?{' '}
            <Link href="/register" style={styles.link}>
              Zarejestruj się
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
  linkWrap: { alignSelf: 'flex-end', marginTop: -space.sm },
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
