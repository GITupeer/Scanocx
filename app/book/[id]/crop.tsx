/**
 * Ręczna korekta kadru strony — przesuwanie 4 rogów + perspective crop + OCR.
 * Styl jasny (Aurora), jak Home / podgląd strony.
 */
import { cropImage } from 'react-native-live-detect-edges';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/src/auth/AuthProvider';
import { getImageSize } from '@/src/images/ensurePortrait';
import { runPageOcrExclusive } from '@/src/ocr/queue';
import { OcrAuthRequiredError, OcrQuotaExceededError } from '@/src/ocr/quota';
import { getBook, replacePageCroppedImage } from '@/src/storage/books';
import {
  AppBar,
  Button,
  CornerCropEditor,
  FadeInUp,
  Loader,
  colors,
  radius,
  shadow,
  space,
  type CornerCropEditorHandle,
} from '@/src/ui';

function toFileUri(path: string): string {
  if (!path) return path;
  if (path.startsWith('file://') || path.startsWith('content://')) return path;
  return `file://${path}`;
}

export default function PageCropScreen() {
  const { id, pageId } = useLocalSearchParams<{ id: string; pageId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { ready, isLoggedIn } = useAuth();
  const editorRef = useRef<CornerCropEditorHandle>(null);

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [editorReady, setEditorReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [sourceLabel, setSourceLabel] = useState('kadr');

  useEffect(() => {
    if (!ready) return;
    if (!isLoggedIn) {
      router.replace('/login');
    }
  }, [ready, isLoggedIn, router]);

  useEffect(() => {
    if (!isLoggedIn) return;
    let cancelled = false;
    void (async () => {
      if (!id || !pageId) return;
      setLoading(true);
      try {
        const book = await getBook(id);
        const page = book.pages.find((p) => p.id === pageId);
        if (!page) throw new Error('Nie znaleziono strony.');

        // Preferuj oryginał — dopasowanie rogów na pełnej klatce.
        const sourceUri = page.originalImageUri?.trim() || page.imageUri?.trim() || null;
        if (!sourceUri) {
          throw new Error('Brak lokalnego zdjęcia tej strony.');
        }
        const size = await getImageSize(sourceUri);
        if (cancelled) return;
        setImageUri(sourceUri);
        setImageSize(size);
        setPageIndex(page.index);
        setSourceLabel(page.originalImageUri?.trim() ? 'oryginał' : 'kadr');
      } catch (error) {
        Alert.alert(
          'Błąd',
          error instanceof Error ? error.message : 'Nie udało się wczytać strony.'
        );
        router.back();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, isLoggedIn, pageId, router]);

  const onApply = useCallback(async () => {
    if (!id || !pageId || !imageUri || busy) return;
    const quad = editorRef.current?.getQuad();
    if (!quad) {
      Alert.alert('Kadr', 'Poczekaj na wczytanie podglądu.');
      return;
    }

    setBusy(true);
    try {
      setHint('Przycinam…');
      const cropped = await cropImage({
        imageUri: toFileUri(imageUri),
        quad,
      });
      if (!cropped?.uri) {
        throw new Error('Nie udało się przyciąć zdjęcia.');
      }

      setHint('Zapisuję…');
      const { page } = await replacePageCroppedImage(id, pageId, toFileUri(cropped.uri));

      if (!isLoggedIn) {
        Alert.alert(
          'Zapisano kadr',
          'Zdjęcie zostało przycięte. Zaloguj się, aby odczytać tekst OCR.'
        );
        router.replace(`/book/${id}/page/${page.id}`);
        return;
      }

      setHint('Odczytuję tekst…');
      try {
        if (page.imageUri?.trim()) {
          await runPageOcrExclusive(id, page.id, page.imageUri, { detectUpright: true });
        }
      } catch (error) {
        if (error instanceof OcrAuthRequiredError || error instanceof OcrQuotaExceededError) {
          Alert.alert('Kadr zapisany', error.message);
          router.replace(`/book/${id}/page/${page.id}`);
          return;
        }
        throw error;
      }

      router.replace(`/book/${id}/page/${page.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/native module|LiveDetect|null|undefined|TurboModule/i.test(message)) {
        Alert.alert(
          'Wymagany nowy build',
          'Przycinanie z perspektywą wymaga development clienta z modułem skanera krawędzi.'
        );
      } else {
        Alert.alert('Kadr', message || 'Nie udało się dopasować kadru.');
      }
      setHint(null);
    } finally {
      setBusy(false);
    }
  }, [busy, id, imageUri, isLoggedIn, pageId, router]);

  if (loading || !imageUri || !imageSize) {
    return <Loader label="Otwieram edycję kadru…" />;
  }

  return (
    <View style={styles.root}>
      <AppBar
        title={`Kadr · strona ${pageIndex}`}
        subtitle={`Źródło: ${sourceLabel} · przesuń rogi i zatwierdź`}
      />

      <FadeInUp style={styles.editorCard}>
        <View style={styles.editorWrap}>
          <CornerCropEditor
            ref={editorRef}
            imageUri={imageUri}
            imageWidth={imageSize.width}
            imageHeight={imageSize.height}
            onReadyChange={setEditorReady}
          />
        </View>
      </FadeInUp>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, space.md) }]}>
        {hint ? (
          <Text style={styles.hint}>{hint}</Text>
        ) : (
          <Text style={styles.hint}>
            Dopasuj 4 rogi do obszaru strony — oryginał zostaje zapisany osobno.
          </Text>
        )}
        <View style={styles.actions}>
          <Button
            label="Anuluj"
            variant="outline"
            disabled={busy}
            onPress={() => router.back()}
            style={styles.secondary}
          />
          <Button
            label={busy ? 'Przetwarzam…' : 'Przytnij i OCR'}
            icon="scan"
            loading={busy}
            disabled={busy || !editorReady}
            onPress={() => void onApply()}
            style={styles.primary}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  editorCard: {
    flex: 1,
    marginHorizontal: space.lg,
    marginTop: space.sm,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
    ...shadow.soft,
  },
  editorWrap: {
    flex: 1,
  },
  footer: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    gap: space.sm,
  },
  hint: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    gap: space.sm,
    padding: space.sm,
    borderRadius: radius.xl,
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.hairline,
    ...shadow.float,
  },
  secondary: {
    flex: 0.42,
  },
  primary: {
    flex: 1,
  },
});
