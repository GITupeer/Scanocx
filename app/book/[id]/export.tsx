import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Book } from '@/src/domain/types';
import { generateAndShareBookPdf } from '@/src/pdf/buildBookPdf';
import { getBook } from '@/src/storage/books';
import {
  AiQueueCard,
  AppBar,
  Badge,
  Button,
  Card,
  Divider,
  Gradient,
  Icon,
  Loader,
  Row,
  ScanQueueCard,
  SectionHeader,
  colors,
  font,
  gradients,
  radius,
  shadow,
  space,
} from '@/src/ui';
import { pages as pagesLabel } from '@/src/utils/format';

export default function ExportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [book, setBook] = useState<Book | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [lastUri, setLastUri] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    void (async () => {
      try {
        const data = await getBook(id);
        setBook(data);
      } catch (error) {
        Alert.alert('Błąd', error instanceof Error ? error.message : 'Nie znaleziono książki.');
        router.back();
      } finally {
        setLoading(false);
      }
    })();
  }, [id, router]);

  const onExport = async () => {
    if (!book) return;
    setExporting(true);
    try {
      const uri = await generateAndShareBookPdf(book);
      setLastUri(uri);
    } catch (error) {
      Alert.alert('Eksport PDF', error instanceof Error ? error.message : 'Nie udało się wygenerować PDF.');
    } finally {
      setExporting(false);
    }
  };

  if (loading || !book) {
    return <Loader label="Przygotowuję eksport…" />;
  }

  const pending = book.pages.filter((p) => p.ocrStatus === 'pending').length;
  const errors = book.pages.filter((p) => p.ocrStatus === 'error').length;
  const ready = book.pages.length - pending - errors;

  return (
    <View style={styles.root}>
      <AppBar title="Eksport PDF" subtitle={book.title} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, space.lg) + space.xxl },
        ]}>
        <Gradient colors={gradients.brandVivid} style={styles.hero}>
          <View style={styles.heroIcon}>
            <Icon name="pdf" size={24} color={colors.white} />
          </View>
          <Text style={styles.heroTitle}>PDF z tekstem AI</Text>
          <Text style={styles.heroBody}>
            Plik powstaje lokalnie i zawiera tekst stron (preferuje korektę AI, inaczej tekst ze skanu)
            — bez zdjęć, więc jest lekki i można go przeszukiwać.
          </Text>
        </Gradient>

        <ScanQueueCard />
        <AiQueueCard />

        {pending > 0 ? (
          <Badge
            label={`${pending} ${pending === 1 ? 'strona czeka' : 'stron czeka'} na analizę — PDF będzie niepełny`}
            tone="warning"
            icon="alert"
            size="md"
          />
        ) : null}

        <SectionHeader title="Zawartość" />
        <Card padded={false}>
          <Row icon="notes" label="Strony" detail={pagesLabel(book.pages.length)} value={String(book.pages.length)} />
          <Divider inset={space.lg + 36 + space.md} />
          <Row
            icon="check"
            label="Gotowy tekst"
            detail="Strony z odczytanym tekstem"
            value={String(ready)}
          />
          <Divider inset={space.lg + 36 + space.md} />
          <Row icon="ai" label="W analizie" value={String(pending)} />
          <Divider inset={space.lg + 36 + space.md} />
          <Row
            icon="alert"
            label="Błędy odczytu"
            tone={errors > 0 ? 'danger' : 'default'}
            value={String(errors)}
          />
        </Card>

        {lastUri ? (
          <Card style={styles.lastCard}>
            <View style={styles.lastHeader}>
              <Icon name="checkCircle" size={16} color={colors.success} />
              <Text style={styles.lastTitle}>Plik wygenerowany</Text>
            </View>
            <Text numberOfLines={2} style={styles.lastUri}>
              {lastUri}
            </Text>
          </Card>
        ) : null}

        <View style={styles.actions}>
          <Button
            label={exporting ? 'Generowanie…' : 'Generuj i udostępnij PDF'}
            icon="share"
            size="lg"
            loading={exporting}
            disabled={book.pages.length === 0}
            onPress={() => void onExport()}
          />
          <Button label="Wróć do książki" variant="outline" onPress={() => router.back()} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  content: {
    paddingHorizontal: space.lg,
    gap: space.md,
  },
  hero: {
    borderRadius: radius.xxl,
    padding: space.xl,
    gap: space.sm,
    ...shadow.card,
  },
  heroIcon: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    marginBottom: space.sm,
  },
  heroTitle: {
    fontSize: 21,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: -0.5,
  },
  heroBody: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.86)',
  },
  lastCard: {
    gap: space.sm,
    backgroundColor: colors.successSoft,
    borderColor: 'rgba(16, 191, 160, 0.28)',
  },
  lastHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  lastTitle: {
    ...font.label,
    color: '#0A8C77',
  },
  lastUri: {
    fontSize: 11.5,
    color: colors.inkSoft,
    lineHeight: 16,
  },
  actions: {
    marginTop: space.md,
    gap: space.md,
  },
});
