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
import { useCallback, useEffect, useRef, useState } from 'react';
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
  replacePageFromCameraUri,
} from '@/src/storage/books';
import {
  AdminScanEditor,
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

type StepId = 'capture' | 'enhance' | 'save' | 'ocr';
type StepStatus = 'pending' | 'active' | 'done' | 'skipped';

type ProcessStep = {
  id: StepId;
  label: string;
  detail?: string;
  status: StepStatus;
};

type ProcessProgress = {
  title: string;
  steps: ProcessStep[];
};

function toFileUri(path: string): string {
  if (!path) return path;
  if (path.startsWith('file://') || path.startsWith('content://')) return path;
  return `file://${path}`;
}

function buildProcessSteps(opts: {
  fromGallery?: boolean;
  isReplace: boolean;
  ocrMode: 'live' | 'deferred' | 'none';
}): ProcessStep[] {
  const ocrStep: ProcessStep =
    opts.ocrMode === 'live'
      ? { id: 'ocr', label: 'Odczyt tekstu', status: 'pending' }
      : opts.ocrMode === 'deferred'
        ? { id: 'ocr', label: 'Odczyt tekstu', status: 'skipped', detail: 'po zakończeniu' }
        : { id: 'ocr', label: 'Odczyt tekstu', status: 'skipped', detail: 'pominięty' };

  return [
    {
      id: 'capture',
      label: opts.fromGallery ? 'Wybór z galerii' : 'Zdjęcie',
      status: 'pending',
    },
    { id: 'enhance', label: 'Poprawa skanu', status: 'pending' },
    {
      id: 'save',
      label: opts.isReplace ? 'Podmiana strony' : 'Zapis strony',
      status: 'pending',
    },
    ocrStep,
  ];
}

function StepGlyph({ status }: { status: StepStatus }) {
  if (status === 'active') {
    return <ActivityIndicator size="small" color={colors.mint} />;
  }
  if (status === 'done') {
    return <Icon name="checkCircle" size={18} color={colors.mint} />;
  }
  if (status === 'skipped') {
    return (
      <View style={styles.stepDotSkipped}>
        <View style={styles.stepDotSkippedInner} />
      </View>
    );
  }
  return <View style={styles.stepDotPending} />;
}

export default function CaptureScreen() {
  const { id, replacePageId } = useLocalSearchParams<{ id: string; replacePageId?: string }>();
  const isReplace = typeof replacePageId === 'string' && replacePageId.length > 0;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { ready, isLoggedIn } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();

  const ocrHintAlertedRef = useRef(false);
  const shutterLockRef = useRef(false);
  const deferredPagesRef = useRef<DeferredPage[]>([]);
  /** Aktualna wartość trybu — bez przebudowy callbacków przy każdym przełączeniu. */
  const processLiveRef = useRef(true);
  const adminModeRef = useRef(false);
  const progressClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ProcessProgress | null>(null);
  const [sessionCount, setSessionCount] = useState(0);
  const [flash, setFlash] = useState(false);
  const [nativeMissing, setNativeMissing] = useState(false);
  /** true = OCR od razu po zdjęciu; false = OCR dopiero po zakończeniu sesji. */
  const [processLive, setProcessLive] = useState(true);
  processLiveRef.current = processLive;
  /** Admin Mode: surowy kadr + ręczna korekcja, bez OCR / auto-enhance w tle. */
  const [adminMode, setAdminMode] = useState(false);
  adminModeRef.current = adminMode;
  const [adminDraftUri, setAdminDraftUri] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!isLoggedIn) {
      router.replace('/login');
    }
  }, [ready, isLoggedIn, router]);

  const clearProgressSoon = useCallback((delayMs = 1400) => {
    if (progressClearTimerRef.current) clearTimeout(progressClearTimerRef.current);
    progressClearTimerRef.current = setTimeout(() => {
      setProgress(null);
      progressClearTimerRef.current = null;
    }, delayMs);
  }, []);

  const startProgress = useCallback(
    (opts: { fromGallery?: boolean; title?: string; ocrMode?: 'live' | 'deferred' | 'none' }) => {
      if (progressClearTimerRef.current) {
        clearTimeout(progressClearTimerRef.current);
        progressClearTimerRef.current = null;
      }
      const ocrMode =
        opts.ocrMode ??
        (adminModeRef.current ? 'none' : processLiveRef.current ? 'live' : 'deferred');
      const steps = buildProcessSteps({
        fromGallery: opts.fromGallery,
        isReplace,
        ocrMode,
      });
      steps[0] = { ...steps[0], status: 'active' };
      setProgress({
        title: opts.title ?? (isReplace ? 'Podmiana strony' : 'Przetwarzanie strony'),
        steps,
      });
    },
    [isReplace]
  );

  const patchStep = useCallback((id: StepId, status: StepStatus, detail?: string) => {
    setProgress((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        steps: prev.steps.map((step) => {
          if (step.id !== id) return step;
          const next: ProcessStep = { ...step, status };
          if (detail !== undefined) next.detail = detail;
          else if (status === 'active' || status === 'done') delete next.detail;
          return next;
        }),
      };
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
      return () => {
        setStatusBarStyle('dark');
        if (progressClearTimerRef.current) clearTimeout(progressClearTimerRef.current);
      };
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
        patchStep('ocr', 'skipped', 'wymaga konta');
        return;
      }
      if (!(await canRunOcr())) {
        notifyOcrSkipped('quota');
        patchStep('ocr', 'skipped', 'limit');
        return;
      }
      patchStep('ocr', 'active');
      try {
        await runPageOcrExclusive(id, pageId, imageUri);
        patchStep('ocr', 'done');
      } catch (error) {
        if (error instanceof OcrAuthRequiredError) {
          notifyOcrSkipped('guest');
          patchStep('ocr', 'skipped', 'wymaga konta');
        } else if (error instanceof OcrQuotaExceededError) {
          notifyOcrSkipped('quota');
          patchStep('ocr', 'skipped', 'limit');
        } else {
          throw error;
        }
      }
    },
    [id, isLoggedIn, notifyOcrSkipped, patchStep]
  );

  const processDeferredPages = useCallback(async () => {
    if (!id) return;
    const pending = deferredPagesRef.current;
    if (pending.length === 0) return;

    deferredPagesRef.current = [];

    if (progressClearTimerRef.current) {
      clearTimeout(progressClearTimerRef.current);
      progressClearTimerRef.current = null;
    }

    setProgress({
      title: `Kończenie · ${pending.length} ${pending.length === 1 ? 'strona' : 'stron'}`,
      steps: [
        {
          id: 'ocr',
          label: 'Kolejka OCR',
          status: 'active',
        },
      ],
    });

    if (!isLoggedIn) {
      notifyOcrSkipped('guest');
      patchStep('ocr', 'skipped', 'wymaga konta');
      clearProgressSoon();
      return;
    }
    if (!(await canRunOcr())) {
      notifyOcrSkipped('quota');
      patchStep('ocr', 'skipped', 'limit');
      clearProgressSoon();
      return;
    }

    const queued = enqueueOcrJobs(
      pending.map((page) => ({
        bookId: id,
        pageId: page.pageId,
        pageIndex: page.pageIndex,
        imageUri: page.imageUri,
      }))
    );
    patchStep(
      'ocr',
      'done',
      queued > 0 ? `${queued} w kolejce` : undefined
    );
    clearProgressSoon(900);
  }, [clearProgressSoon, id, isLoggedIn, notifyOcrSkipped, patchStep]);

  const leaveCapture = useCallback(async () => {
    if (busy || adminDraftUri) return;
    if (deferredPagesRef.current.length > 0) {
      setBusy(true);
      try {
        await processDeferredPages();
      } catch (error) {
        Alert.alert(
          'Błąd',
          error instanceof Error ? error.message : 'Nie udało się dokończyć przetwarzania.'
        );
        setProgress(null);
      } finally {
        setBusy(false);
      }
    }
    router.back();
  }, [adminDraftUri, busy, processDeferredPages, router]);

  const saveProcessedUri = useCallback(
    async (saveUriPath: string, opts?: { skipOcr?: boolean }) => {
      if (!id) return;
      const skipOcr = opts?.skipOcr === true;

      patchStep('save', 'active');

      if (isReplace) {
        const { page } = await replacePageFromCameraUri(id, replacePageId, saveUriPath);
        patchStep('save', 'done');
        if (!skipOcr) {
          if (page.imageUri?.trim()) {
            await tryOcr(page.index, page.id, page.imageUri);
          }
        } else {
          patchStep('ocr', 'skipped', 'pominięty');
        }
        clearProgressSoon(700);
        router.replace(`/book/${id}/page/${page.id}`);
        return;
      }

      const { page } = await addPageFromCameraUri(id, saveUriPath);
      setSessionCount((n) => n + 1);
      setProgress((prev) =>
        prev
          ? { ...prev, title: `Strona ${page.index}` }
          : prev
      );
      patchStep('save', 'done');

      if (skipOcr) {
        patchStep('ocr', 'skipped', 'pominięty');
        clearProgressSoon();
        return;
      }

      const live = processLiveRef.current;
      if (live) {
        if (page.imageUri?.trim()) {
          await tryOcr(page.index, page.id, page.imageUri);
        }
      } else if (page.imageUri?.trim()) {
        deferredPagesRef.current.push({
          pageId: page.id,
          pageIndex: page.index,
          imageUri: page.imageUri,
        });
        patchStep('ocr', 'skipped', 'po zakończeniu');
      } else {
        patchStep('ocr', 'skipped', 'brak zdjęcia');
      }
      clearProgressSoon();
    },
    [clearProgressSoon, id, isReplace, patchStep, replacePageId, router, tryOcr]
  );

  const saveUri = useCallback(
    async (rawUri: string) => {
      if (!id) return;
      const uri = toFileUri(rawUri);

      if (adminModeRef.current) {
        setProgress(null);
        // Chwila na domknięcie natywnego takePhoto zanim Modal przykryje kamerę.
        setTimeout(() => setAdminDraftUri(uri), 80);
        return;
      }

      setBusy(true);
      try {
        patchStep('capture', 'done');
        patchStep('enhance', 'active');
        // Enhance zawsze od razu po zdjęciu — niezależnie od processLive (OCR live / szybkie skanowanie).
        const enhanced = await enhanceScanClarity(uri, { mode: 'document' });
        patchStep('enhance', 'done');
        await saveProcessedUri(enhanced);
      } catch (error) {
        Alert.alert(
          'Błąd',
          error instanceof Error ? error.message : 'Nie udało się zapisać skanu.'
        );
        setProgress(null);
      } finally {
        setBusy(false);
      }
    },
    [id, patchStep, saveProcessedUri]
  );

  const saveAdminDraft = useCallback(
    async (editedUri: string) => {
      if (!id) return;
      setBusy(true);
      startProgress({ title: 'Zapis Admin Mode', ocrMode: 'none' });
      patchStep('capture', 'done');
      patchStep('enhance', 'done', 'ręcznie');
      try {
        await saveProcessedUri(toFileUri(editedUri), { skipOcr: true });
        setAdminDraftUri(null);
      } catch (error) {
        Alert.alert(
          'Błąd',
          error instanceof Error ? error.message : 'Nie udało się zapisać skanu.'
        );
        setProgress(null);
      } finally {
        setBusy(false);
      }
    },
    [id, patchStep, saveProcessedUri, startProgress]
  );

  const onShutter = useCallback(async () => {
    if (busy || shutterLockRef.current) return;
    shutterLockRef.current = true;
    setFlash(true);
    setTimeout(() => setFlash(false), 70);
    if (!adminModeRef.current) {
      startProgress({
        title: isReplace ? 'Podmiana strony' : 'Przetwarzanie strony',
      });
    }

    try {
      const result = await takePhoto();
      const cropped = result.image?.uri ?? result.originalImage?.uri;
      if (!cropped) {
        Alert.alert('Skan', 'Nie udało się zrobić zdjęcia.');
        setProgress(null);
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
      setProgress(null);
    } finally {
      shutterLockRef.current = false;
    }
  }, [busy, isReplace, saveUri, startProgress]);

  const onGallery = useCallback(async () => {
    if (busy) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
    });
    if (result.canceled || !result.assets[0]?.uri) return;
    if (!adminModeRef.current) {
      startProgress({
        fromGallery: true,
        title: isReplace ? 'Podmiana strony' : 'Przetwarzanie strony',
      });
    }
    await saveUri(result.assets[0].uri);
  }, [busy, isReplace, saveUri, startProgress]);

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

  const canLeave = !busy && !adminDraftUri;
  const shutterLocked = busy || Boolean(adminDraftUri);

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
              label={adminMode ? 'Admin Mode' : isReplace ? 'Podmiana strony' : 'Skanowanie'}
              tone="glass"
              icon={adminMode ? 'tune' : 'scan'}
              size="md"
            />
          </View>
          <View style={styles.topRight}>
            {!adminMode ? (
              <IconButton
                name={processLive ? 'bolt' : 'clock'}
                accessibilityLabel={
                  processLive
                    ? 'OCR na żywo włączone. Wyłącz, aby skanować szybciej.'
                    : 'Szybkie skanowanie. Włącz OCR na żywo.'
                }
                variant="glass"
                size={44}
                round
                disabled={busy}
                tint={processLive ? colors.mint : 'rgba(255,255,255,0.55)'}
                onPress={() => setProcessLive((v) => !v)}
              />
            ) : null}
            <IconButton
              name="tune"
              accessibilityLabel={
                adminMode
                  ? 'Admin Mode włączony. Wyłącz, aby wrócić do automatycznego przetwarzania.'
                  : 'Włącz Admin Mode — ręczna korekcja bez OCR.'
              }
              variant="glass"
              size={44}
              round
              disabled={busy}
              tint={adminMode ? colors.mint : 'rgba(255,255,255,0.55)'}
              onPress={() => setAdminMode((v) => !v)}
            />
          </View>
        </View>

        <View pointerEvents="none" style={[styles.statusChip, { top: insets.top + 68 }]}>
          <View
            style={[
              styles.statusDot,
              adminMode || processLive ? styles.statusDotOn : styles.statusDotOff,
            ]}
          />
          <Text style={styles.statusText}>
            {adminMode
              ? 'Admin Mode · ręczna korekcja, bez OCR'
              : processLive
                ? 'Celuj w jedną stronę książki'
                : 'Szybkie skanowanie · OCR po zakończeniu'}
          </Text>
        </View>

        {progress ? (
          <View pointerEvents="none" style={styles.progressCard}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressTitle}>{progress.title}</Text>
              {!isReplace && sessionCount > 0 ? (
                <Text style={styles.progressMeta}>zdjęć: {sessionCount}</Text>
              ) : null}
            </View>
            <View style={styles.progressList}>
              {progress.steps.map((step) => {
                const isActive = step.status === 'active';
                const isDone = step.status === 'done';
                const isSkipped = step.status === 'skipped';
                return (
                  <View key={step.id} style={styles.progressRow}>
                    <View style={styles.progressGlyph}>
                      <StepGlyph status={step.status} />
                    </View>
                    <Text
                      style={[
                        styles.progressLabel,
                        isActive && styles.progressLabelActive,
                        isDone && styles.progressLabelDone,
                        isSkipped && styles.progressLabelSkipped,
                      ]}>
                      {step.label}
                    </Text>
                    {step.detail ? (
                      <Text style={styles.progressDetail}>{step.detail}</Text>
                    ) : null}
                  </View>
                );
              })}
            </View>
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
          disabled={busy || Boolean(adminDraftUri)}
          onPress={() => void onGallery()}
          style={({ pressed }) => [
            styles.sideButton,
            pressed && styles.sidePressed,
            (busy || Boolean(adminDraftUri)) && styles.disabled,
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

      {adminDraftUri ? (
        <AdminScanEditor
          uri={adminDraftUri}
          busy={busy}
          onCancel={() => {
            if (busy) return;
            setAdminDraftUri(null);
            setProgress(null);
          }}
          onSave={(editedUri) => void saveAdminDraft(editedUri)}
        />
      ) : null}
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
  topRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
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
  progressCard: {
    position: 'absolute',
    left: space.xl,
    right: space.xl,
    bottom: space.xl,
    backgroundColor: 'rgba(10, 12, 20, 0.88)',
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    gap: space.sm,
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    marginBottom: 2,
  },
  progressTitle: {
    flex: 1,
    color: colors.white,
    fontSize: 13.5,
    fontWeight: '800',
  },
  progressMeta: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    fontWeight: '600',
  },
  progressList: {
    gap: 8,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  progressGlyph: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotPending: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  stepDotSkipped: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotSkippedInner: {
    width: 7,
    height: 1.5,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  progressLabel: {
    flex: 1,
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    fontWeight: '600',
  },
  progressLabelActive: {
    color: colors.white,
    fontWeight: '700',
  },
  progressLabelDone: {
    color: 'rgba(255,255,255,0.92)',
  },
  progressLabelSkipped: {
    color: 'rgba(255,255,255,0.42)',
  },
  progressDetail: {
    color: 'rgba(255,255,255,0.42)',
    fontSize: 11.5,
    fontWeight: '600',
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
