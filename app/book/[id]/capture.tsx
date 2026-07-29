/**
 * Ekran skanowania — wbudowany skaner w aplikacji.
 *
 * Silnik: react-native-live-detect-edges
 *  - Android: FairScan / OpenCV
 *  - iOS: WeScan
 *
 * LiveDetectEdgesView = kamera w naszym UI; takePhoto robi crop + wyprostowanie.
 */
import * as ImagePicker from 'expo-image-picker';
import { useCameraPermissions } from 'expo-camera';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LiveDetectEdgesView, takePhoto } from 'react-native-live-detect-edges';

import { useAuth } from '@/src/auth/AuthProvider';
import { enhanceScanClarity } from '@/src/images/enhanceScanClarity';
import { enqueueOcrJobs, runPageOcrExclusive } from '@/src/ocr/queue';
import {
  canRunOcr,
  OcrAuthRequiredError,
  OcrQuotaExceededError,
} from '@/src/ocr/quota';
import {
  addPageFromCameraUri,
  persistPageImageFile,
  replacePageFromCameraUri,
} from '@/src/storage/books';
import {
  Badge,
  Button,
  Gradient,
  Icon,
  IconButton,
  colors,
  gradients,
  radius,
  shadow,
  space,
} from '@/src/ui';

type DeferredPage = {
  pageId: string;
  pageIndex: number;
  imageUri: string;
};

function toFileUri(path: string): string {
  if (!path) return path;
  if (path.startsWith('file://') || path.startsWith('content://')) return path;
  return `file://${path}`;
}

export default function CaptureScreen() {
  const { id, replacePageId } = useLocalSearchParams<{ id: string; replacePageId?: string }>();
  const isReplace = typeof replacePageId === 'string' && replacePageId.length > 0;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isLoggedIn } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();

  const ocrHintAlertedRef = useRef(false);
  const shutterLockRef = useRef(false);
  const deferredPagesRef = useRef<DeferredPage[]>([]);
  /** Aktualna wartość trybu — bez przebudowy callbacków przy każdym przełączeniu. */
  const processLiveRef = useRef(true);

  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [sessionCount, setSessionCount] = useState(0);
  const [flash, setFlash] = useState(false);
  const [nativeMissing, setNativeMissing] = useState(false);
  /** true = podbijanie kolorów + OCR od razu po zdjęciu; false = dopiero po zakończeniu. */
  const [processLive, setProcessLive] = useState(true);
  processLiveRef.current = processLive;

  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
      return () => setStatusBarStyle('dark');
    }, [])
  );

  const notifyOcrSkipped = useCallback((reason: 'guest' | 'quota') => {
    if (ocrHintAlertedRef.current) return;
    ocrHintAlertedRef.current = true;
    if (reason === 'guest') {
      Alert.alert(
        'Tylko zdjęcia',
        'Bez konta zapisujesz skany lokalnie. Zaloguj się, aby odczytać tekst (OCR) i korzystać z AI.'
      );
      return;
    }
    Alert.alert(
      'Limit OCR',
      'Darmowy plan: 30 odczytów tekstu na miesiąc. Zdjęcia zapisujesz dalej bez limitu — OCR możesz uruchomić później (Pro = nielimitowane).'
    );
  }, []);

  const tryOcr = useCallback(
    async (pageIndex: number, pageId: string, imageUri: string) => {
      if (!id) return;
      if (!isLoggedIn) {
        notifyOcrSkipped('guest');
        setHint(`Zapisano · bez OCR · strona ${pageIndex}`);
        return;
      }
      if (!(await canRunOcr())) {
        notifyOcrSkipped('quota');
        setHint(`Zapisano · bez OCR · strona ${pageIndex}`);
        return;
      }
      setHint(`Rozpoznawanie tekstu · strona ${pageIndex}…`);
      try {
        await runPageOcrExclusive(id, pageId, imageUri);
        setHint(`Gotowe · strona ${pageIndex}`);
      } catch (error) {
        if (error instanceof OcrAuthRequiredError) {
          notifyOcrSkipped('guest');
          setHint(`Zapisano · bez OCR · strona ${pageIndex}`);
        } else if (error instanceof OcrQuotaExceededError) {
          notifyOcrSkipped('quota');
          setHint(`Zapisano · bez OCR · strona ${pageIndex}`);
        } else {
          throw error;
        }
      }
    },
    [id, isLoggedIn, notifyOcrSkipped]
  );

  const processDeferredPages = useCallback(async () => {
    if (!id) return;
    const pending = deferredPagesRef.current;
    if (pending.length === 0) return;

    deferredPagesRef.current = [];
    const enhanced: DeferredPage[] = [];

    for (let i = 0; i < pending.length; i++) {
      const item = pending[i];
      setHint(`Podbijam kontrast · ${i + 1}/${pending.length}…`);
      try {
        const clearUri = await enhanceScanClarity(item.imageUri);
        const nextUri = await persistPageImageFile(id, item.pageId, clearUri);
        enhanced.push({ ...item, imageUri: nextUri });
      } catch {
        enhanced.push(item);
      }
    }

    if (!isLoggedIn) {
      notifyOcrSkipped('guest');
      setHint(`Zapisano · ${enhanced.length} bez OCR`);
      return;
    }
    if (!(await canRunOcr())) {
      notifyOcrSkipped('quota');
      setHint(`Zapisano · ${enhanced.length} bez OCR`);
      return;
    }

    const queued = enqueueOcrJobs(
      enhanced.map((page) => ({
        bookId: id,
        pageId: page.pageId,
        pageIndex: page.pageIndex,
        imageUri: page.imageUri,
      }))
    );
    setHint(
      queued > 0
        ? `Kolejka OCR · ${queued} ${queued === 1 ? 'strona' : 'stron'}`
        : `Gotowe · ${enhanced.length}`
    );
  }, [id, isLoggedIn, notifyOcrSkipped]);

  const leaveCapture = useCallback(async () => {
    if (busy) return;
    if (deferredPagesRef.current.length > 0) {
      setBusy(true);
      try {
        await processDeferredPages();
      } catch (error) {
        Alert.alert(
          'Błąd',
          error instanceof Error ? error.message : 'Nie udało się dokończyć przetwarzania.'
        );
      } finally {
        setBusy(false);
      }
    }
    router.back();
  }, [busy, processDeferredPages, router]);

  const saveUri = useCallback(
    async (rawUri: string) => {
      if (!id) return;
      const uri = toFileUri(rawUri);
      const live = processLiveRef.current;
      setBusy(true);
      try {
        let saveUriPath = uri;
        if (live) {
          setHint('Podbijam kontrast…');
          saveUriPath = await enhanceScanClarity(uri);
        }

        if (isReplace) {
          // Podmiana kończy sesję od razu — zawsze dociągamy kontrast + OCR przed wyjściem.
          let finalUri = saveUriPath;
          if (!live) {
            setHint('Podbijam kontrast…');
            finalUri = await enhanceScanClarity(uri);
          }
          setHint('Podmieniam…');
          const { page } = await replacePageFromCameraUri(id, replacePageId, finalUri);
          await tryOcr(page.index, page.id, page.imageUri);
          router.replace(`/book/${id}/page/${page.id}`);
          return;
        }

        setHint('Zapisuję…');
        const { page } = await addPageFromCameraUri(id, saveUriPath);
        setSessionCount((n) => n + 1);

        if (live) {
          await tryOcr(page.index, page.id, page.imageUri);
        } else {
          deferredPagesRef.current.push({
            pageId: page.id,
            pageIndex: page.index,
            imageUri: page.imageUri,
          });
          setHint(`Zapisano · strona ${page.index}`);
        }
      } catch (error) {
        Alert.alert(
          'Błąd',
          error instanceof Error ? error.message : 'Nie udało się zapisać skanu.'
        );
        setHint(null);
      } finally {
        setBusy(false);
      }
    },
    [id, isReplace, replacePageId, router, tryOcr]
  );

  const onShutter = useCallback(async () => {
    if (busy || shutterLockRef.current) return;
    shutterLockRef.current = true;
    setFlash(true);
    setTimeout(() => setFlash(false), 70);
    setHint(isReplace ? 'Skanuję…' : 'Skanuję stronę…');

    try {
      const result = await takePhoto();
      const cropped = result.image?.uri ?? result.originalImage?.uri;
      if (!cropped) {
        Alert.alert('Skan', 'Nie udało się zrobić zdjęcia.');
        setHint(null);
        return;
      }
      await saveUri(cropped);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/native module|LiveDetect|null|undefined|TurboModule/i.test(message)) {
        setNativeMissing(true);
        Alert.alert(
          'Wymagany nowy build',
          'Wbudowany skaner krawędzi wymaga nowego development clienta (EAS). Obecna aplikacja go nie zawiera.'
        );
      } else {
        Alert.alert('Błąd', message || 'Nie udało się zeskanować strony.');
      }
      setHint(null);
    } finally {
      shutterLockRef.current = false;
    }
  }, [busy, isReplace, saveUri]);

  const onGallery = useCallback(async () => {
    if (busy) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
    });
    if (result.canceled || !result.assets[0]?.uri) return;
    await saveUri(result.assets[0].uri);
  }, [busy, saveUri]);

  if (!permission) {
    return <View style={styles.root} />;
  }

  if (!permission.granted) {
    return (
      <View style={[styles.root, styles.permission, { paddingBottom: insets.bottom + space.xxl }]}>
        <Gradient colors={gradients.brandVivid} style={styles.permIcon}>
          <Icon name="camera" size={28} color={colors.white} />
        </Gradient>
        <Text style={styles.permTitle}>Potrzebujemy dostępu do kamery</Text>
        <Text style={styles.permBody}>
          Skaner działa w aplikacji — live krawędzie strony i wyprostowanie po zdjęciu.
        </Text>
        <View style={styles.permActions}>
          <Button label="Udostępnij kamerę" icon="camera" onPress={() => void requestPermission()} />
          <Button label="Wróć" variant="glass" onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  const canLeave = !busy;
  const shutterLocked = busy;

  return (
    <View style={styles.root}>
      <View style={styles.stage}>
        {!nativeMissing ? (
          <LiveDetectEdgesView
            style={StyleSheet.absoluteFill}
            overlayColor="rgba(16, 191, 160, 0.95)"
            overlayFillColor="rgba(16, 191, 160, 0.18)"
            overlayStrokeWidth={3}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.missing]}>
            <Text style={styles.missingTitle}>Brak natywnego modułu</Text>
            <Text style={styles.missingBody}>
              Zrób nowy build: eas build --profile development
            </Text>
          </View>
        )}

        {flash ? <View pointerEvents="none" style={styles.flash} /> : null}

        <View pointerEvents="box-none" style={[styles.topBar, { paddingTop: insets.top + space.sm }]}>
          <IconButton
            name="close"
            accessibilityLabel={isReplace ? 'Anuluj podmianę' : 'Zakończ skanowanie'}
            variant="glass"
            size={44}
            round
            disabled={!canLeave}
            onPress={() => void leaveCapture()}
          />
          <View style={styles.topCenter}>
            <Badge
              label={isReplace ? 'Podmiana strony' : 'Skanowanie'}
              tone="glass"
              icon="scan"
              size="md"
            />
          </View>
          <IconButton
            name={processLive ? 'bolt' : 'clock'}
            accessibilityLabel={
              processLive
                ? 'Przetwarzanie na żywo włączone. Wyłącz, aby skanować szybciej.'
                : 'Szybkie skanowanie. Włącz przetwarzanie na żywo.'
            }
            variant="glass"
            size={44}
            round
            disabled={busy}
            tint={processLive ? colors.mint : 'rgba(255,255,255,0.55)'}
            onPress={() => setProcessLive((v) => !v)}
          />
        </View>

        <View pointerEvents="none" style={[styles.statusChip, { top: insets.top + 68 }]}>
          <View style={[styles.statusDot, processLive ? styles.statusDotOn : styles.statusDotOff]} />
          <Text style={styles.statusText}>
            {processLive
              ? 'Celuj w jedną stronę książki'
              : 'Szybkie skanowanie · Auto po zakończeniu'}
          </Text>
        </View>

        {hint ? (
          <View pointerEvents="none" style={styles.toast}>
            <Icon name="check" size={14} color={colors.white} />
            <Text style={styles.toastText}>
              {hint}
              {!isReplace && sessionCount > 0 ? ` · zdjęć: ${sessionCount}` : ''}
            </Text>
          </View>
        ) : null}
      </View>

      <Gradient
        colors={gradients.night}
        angle={180}
        fallbackColor={colors.night}
        style={[styles.bar, { paddingBottom: Math.max(insets.bottom, space.lg) }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Wybierz z galerii"
          disabled={busy}
          onPress={() => void onGallery()}
          style={({ pressed }) => [
            styles.sideButton,
            pressed && styles.sidePressed,
            busy && styles.disabled,
          ]}>
          <Icon name="gallery" size={22} color={colors.white} />
          <Text style={styles.sideLabel}>Galeria</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Zrób zdjęcie strony"
          disabled={shutterLocked || nativeMissing}
          onPress={() => void onShutter()}
          style={({ pressed }) => [
            styles.shutterWrap,
            (shutterLocked || nativeMissing) && styles.disabled,
            pressed && !shutterLocked ? styles.shutterPressed : null,
          ]}>
          <Gradient colors={gradients.brandVivid} style={styles.shutterRing}>
            <View style={[styles.shutterCore, busy && styles.shutterCoreBusy]}>
              {busy ? <ActivityIndicator size="large" color={colors.mint} /> : null}
            </View>
          </Gradient>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isReplace ? 'Anuluj' : 'Gotowe'}
          disabled={!canLeave}
          onPress={() => void leaveCapture()}
          style={({ pressed }) => [
            styles.sideButton,
            pressed && styles.sidePressed,
            !canLeave && styles.disabled,
          ]}>
          <Icon name={isReplace ? 'close' : 'check'} size={22} color={colors.white} />
          <Text style={styles.sideLabel}>
            {isReplace ? 'Anuluj' : sessionCount > 0 ? `Gotowe · ${sessionCount}` : 'Gotowe'}
          </Text>
        </Pressable>
      </Gradient>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.night,
  },
  stage: {
    flex: 1,
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  missing: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xxl,
    gap: space.sm,
    backgroundColor: colors.nightSoft,
  },
  missingTitle: {
    color: colors.white,
    fontSize: 18,
    fontWeight: '800',
  },
  missingBody: {
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
  },
  flash: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#fff',
    opacity: 0.5,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    gap: space.md,
  },
  topCenter: {
    flex: 1,
    alignItems: 'center',
  },
  statusChip: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: space.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(10, 12, 20, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusDotOn: {
    backgroundColor: colors.mint,
  },
  statusDotOff: {
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  statusText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '700',
  },
  toast: {
    position: 'absolute',
    left: space.xl,
    right: space.xl,
    bottom: space.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    backgroundColor: 'rgba(10, 12, 20, 0.82)',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  toastText: {
    color: colors.white,
    textAlign: 'center',
    fontSize: 13.5,
    fontWeight: '700',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.xl,
    paddingTop: space.lg,
  },
  sideButton: {
    width: 82,
    alignItems: 'center',
    gap: 5,
    paddingVertical: space.sm,
    borderRadius: radius.md,
  },
  sidePressed: {
    opacity: 0.6,
  },
  sideLabel: {
    color: 'rgba(255,255,255,0.86)',
    fontSize: 12,
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.38,
  },
  shutterWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.float,
  },
  shutterCore: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterCoreBusy: {
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  shutterPressed: {
    transform: [{ scale: 0.94 }],
  },
  permission: {
    justifyContent: 'center',
    paddingHorizontal: space.xxl,
    gap: space.md,
  },
  permIcon: {
    width: 58,
    height: 58,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
  },
  permTitle: {
    color: colors.white,
    fontSize: 23,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  permBody: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 15,
    lineHeight: 22,
  },
  permActions: {
    marginTop: space.lg,
    gap: space.md,
  },
});
