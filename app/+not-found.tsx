import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AuroraBackdrop, EmptyState, colors } from '@/src/ui';

export default function NotFoundScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <AuroraBackdrop height={320} />
      <EmptyState
        icon="search"
        title="Tego ekranu nie ma"
        body="Ścieżka, którą próbujesz otworzyć, nie istnieje w Scanocx."
        action={{ label: 'Wróć do biblioteki', icon: 'library', onPress: () => router.replace('/') }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: colors.canvas,
  },
});
