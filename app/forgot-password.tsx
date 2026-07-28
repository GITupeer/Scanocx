import { useRouter } from 'expo-router';
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

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    if (!isApiConfigured()) {
      Alert.alert('API', 'Brak EXPO_PUBLIC_API_BASE_URL w konfiguracji.');
      return;
    }
    if (!email.trim()) {
      Alert.alert('Reset hasła', 'Podaj email.');
      return;
    }
    setLoading(true);
    try {
      const result = await api.forgotPassword(email.trim());
      Alert.alert('Reset hasła', result.message, [
        {
          text: 'OK',
          onPress: () =>
            router.push({ pathname: '/reset-password', params: { email: email.trim() } }),
        },
      ]);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Nie udało się wysłać maila.';
      Alert.alert('Reset hasła', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <AuroraBackdrop height={220} warm />
      <AppBar title="Reset hasła" onBack={() => router.back()} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + space.xl },
          ]}
          keyboardShouldPersistTaps="handled">
          <Text style={styles.subtitle}>
            Wyślemy link / token resetu na podany adres email.
          </Text>
          <TextField
            label="Email"
            icon="info"
            value={email}
            onChangeText={setEmail}
            placeholder="ty@email.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
          <Button label="Wyślij" loading={loading} onPress={() => void onSubmit()} />
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
