import { Stack } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { AuthProvider } from '@/src/auth/AuthProvider';
import { rebuildSearchIndex } from '@/src/search/rebuild';
import { colors } from '@/src/ui/theme';

export { ErrorBoundary } from 'expo-router';

export default function RootLayout() {
  useEffect(() => {
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    void rebuildSearchIndex().catch((error) => {
      console.warn('[search] rebuild failed', error);
    });
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.canvas },
            orientation: 'portrait',
            animation: 'slide_from_right',
          }}>
          <Stack.Screen name="index" options={{ animation: 'fade' }} />
          <Stack.Screen name="login" />
          <Stack.Screen name="register" />
          <Stack.Screen name="forgot-password" />
          <Stack.Screen name="reset-password" />
          <Stack.Screen name="profile" />
          <Stack.Screen name="usage" />
          <Stack.Screen name="subscribe" />
          <Stack.Screen name="admin/users" />
          <Stack.Screen name="book/[id]/index" />
          <Stack.Screen name="book/[id]/capture" options={{ animation: 'fade_from_bottom' }} />
          <Stack.Screen name="book/[id]/page/[pageId]" />
          <Stack.Screen name="book/[id]/text" />
          <Stack.Screen name="book/[id]/export" />
        </Stack>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
