import { useLocalSearchParams, useRouter } from 'expo-router';
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
import * as api from '@/src/api/endpoints';
import { ApiError } from '@/src/api/types';
import { AppBar, AuroraBackdrop, Button, TextField, colors, font, space } from '@/src/ui';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ email?: string; token?: string }>();
  const [email, setEmail] = useState(params.email ?? '');
  const [token, setToken] = useState(params.token ?? '');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    if (!isApiConfigured()) {
      Alert.alert('API', 'Brak EXPO_PUBLIC_API_BASE_URL w konfiguracji.');
      return;
    }
    if (!email.trim() || !token.trim() || !password) {
      Alert.alert('Nowe hasło', 'Uzupełnij email, token i hasło.');
      return;
    }
    if (password !== password2) {
      Alert.alert('Nowe hasło', 'Hasła nie są takie same.');
      return;
    }
    setLoading(true);
    try {
      const result = await api.resetPassword({
        email: email.trim(),
        token: token.trim(),
        password,
        password_confirmation: password,
      });
      Alert.alert('Nowe hasło', result.message, [
        { text: 'OK', onPress: () => router.replace('/login') },
      ]);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Nie udało się zmienić hasła.';
      Alert.alert('Nowe hasło', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <AuroraBackdrop height={220} warm />
      <AppBar title="Nowe hasło" onBack={() => router.back()} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + space.xl },
          ]}
          keyboardShouldPersistTaps="handled">
          <Text style={styles.subtitle}>Wklej token z maila i ustaw nowe hasło.</Text>
          <TextField
            label="Email"
            icon="info"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <TextField
            label="Token"
            icon="bolt"
            value={token}
            onChangeText={setToken}
            autoCapitalize="none"
            placeholder="token z wiadomości"
          />
          <TextField
            label="Nowe hasło"
            icon="lock"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
          />
          <TextField
            label="Powtórz hasło"
            icon="lock"
            value={password2}
            onChangeText={setPassword2}
            secureTextEntry
            autoCapitalize="none"
            onSubmitEditing={() => void onSubmit()}
          />
          <Button label="Zapisz hasło" loading={loading} onPress={() => void onSubmit()} />
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
    paddingTop: space.md,
  },
  subtitle: {
    ...font.body,
    color: colors.muted,
  },
});
