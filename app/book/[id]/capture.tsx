/**
 * Ekran skanowania — wbudowany skaner w aplikacji.
 *
 * Silnik: react-native-live-detect-edges
 *  - Android: FairScan / OpenCV
 *  - iOS: WeScan
 *
 * LiveDetectEdgesView = kamera w naszym UI; takePhoto robi crop + wyprostowanie.
 */
import { useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import * as ScreenOrientation from "expo-screen-orientation";
import { setStatusBarStyle } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LiveDetectEdgesView, takePhoto } from "react-native-live-detect-edges";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth/AuthProvider";
import { enhanceScanClarity } from "@/src/images/enhanceScanClarity";
import { ensureLocalBook } from "@/src/library/books";
import { runPageOcrExclusive } from "@/src/ocr/queue";
import {
  canRunOcr,
  OcrAuthRequiredError,
  OcrQuotaExceededError,
} from "@/src/ocr/quota";
import {
  assertCanAddPhoto,
  PhotoQuotaExceededError,
  refreshPhotoQuota,
} from "@/src/photos/quota";
import {
  addPageFromCameraUri,
  replacePageFromCameraUri,
} from "@/src/storage/books";
import {
  Button,
  colors,
  Gradient,
  gradients,
  Icon,
  IconButton,
  radius,
  shadow,
  space,
} from "@/src/ui";

type StepId = "capture" | "enhance" | "save" | "ocr";
type StepStatus = "pending" | "active" | "done" | "skipped";

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
  if (path.startsWith("file://") || path.startsWith("content://")) return path;
  return `file://${path}`;
}

function buildProcessSteps(opts: {
  fromGallery?: boolean;
  isReplace: boolean;
  enhance: boolean;
  ocr: boolean;
}): ProcessStep[] {
  return [
    {
      id: "capture",
      label: opts.fromGallery ? "Wybór z galerii" : "Zdjęcie",
      status: "pending",
    },
    opts.enhance
      ? { id: "enhance", label: "Tworzenie Dokumentu", status: "pending" }
      : {
          id: "enhance",
          label: "Tworzenie Dokumentu",
          status: "skipped",
          detail: "wyłączona",
        },
    {
      id: "save",
      label: opts.isReplace ? "Podmiana strony" : "Zapis strony",
      status: "pending",
    },
    opts.ocr
      ? { id: "ocr", label: "Przetwarzanie tekstu", status: "pending" }
      : {
          id: "ocr",
          label: "Przetwarzanie tekstu",
          status: "skipped",
          detail: "wyłączony",
        },
  ];
}

function StepGlyph({ status }: { status: StepStatus }) {
  if (status === "active") {
    return <ActivityIndicator size="small" color={colors.mint} />;
  }
  if (status === "done") {
    return <Icon name="checkCircle" size={18} color={colors.mint} />;
  }
  if (status === "skipped") {
    return (
      <View style={styles.stepDotSkipped}>
        <View style={styles.stepDotSkippedInner} />
      </View>
    );
  }
  return <View style={styles.stepDotPending} />;
}

export default function CaptureScreen() {
  const { id, replacePageId } = useLocalSearchParams<{
    id: string;
    replacePageId?: string;
  }>();
  const isReplace =
    typeof replacePageId === "string" && replacePageId.length > 0;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { ready, isLoggedIn, user } = useAuth();
  const isPro = user?.plan === "pro";
  const [permission, requestPermission] = useCameraPermissions();

  const ocrHintAlertedRef = useRef(false);
  const shutterLockRef = useRef(false);
  /** Aktualne wartości opcji — bez przebudowy callbacków przy każdym przełączeniu. */
  const cropEdgesRef = useRef(true);
  const enhanceDocumentRef = useRef(true);
  const runOcrRef = useRef(true);
  const multiPageModeRef = useRef(false);
  /** Snapshot toggle’ów sprzed trybu wielu stron — przywracany po wyłączeniu. */
  const savedTogglesRef = useRef<{
    cropEdges: boolean;
    enhanceDocument: boolean;
    runOcr: boolean;
  } | null>(null);
  const progressClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ProcessProgress | null>(null);
  const [sessionCount, setSessionCount] = useState(0);
  const [flash, setFlash] = useState(false);
  const [nativeMissing, setNativeMissing] = useState(false);
  /** Auto-kadr do wykrytych narożników strony. */
  const [cropEdges, setCropEdges] = useState(true);
  cropEdgesRef.current = cropEdges;
  /** Enhance „Dokument” w locie (biały papier / kontrast). */
  const [enhanceDocument, setEnhanceDocument] = useState(true);
  enhanceDocumentRef.current = enhanceDocument;
  /** OCR od razu po zapisie; wyłączone = tylko zdjęcie, bez automatycznego odczytu. */
  const [runOcr, setRunOcr] = useState(true);
  runOcrRef.current = runOcr;
  /** Rozkładówka / wiele stron — landscape, pełna klatka, tylko AI. */
  const [multiPageMode, setMultiPageMode] = useState(false);
  multiPageModeRef.current = multiPageMode;

  useEffect(() => {
    if (!ready) return;
    if (!isLoggedIn) {
      router.replace("/login");
      return;
    }
    if (!id) return;
    // Cloud-only książka z listy nie ma lokalnego meta.json — materializuj shell wcześniej.
    void ensureLocalBook(id).catch((error) => {
      Alert.alert(
        "Błąd",
        error instanceof Error ? error.message : "Nie znaleziono książki.",
      );
      router.replace("/");
    });
  }, [ready, isLoggedIn, id, router]);

  const clearProgressSoon = useCallback((delayMs = 1400) => {
    if (progressClearTimerRef.current)
      clearTimeout(progressClearTimerRef.current);
    progressClearTimerRef.current = setTimeout(() => {
      setProgress(null);
      progressClearTimerRef.current = null;
    }, delayMs);
  }, []);

  const startProgress = useCallback(
    (opts: { fromGallery?: boolean; title?: string } = {}) => {
      if (progressClearTimerRef.current) {
        clearTimeout(progressClearTimerRef.current);
        progressClearTimerRef.current = null;
      }
      const steps = buildProcessSteps({
        fromGallery: opts.fromGallery,
        isReplace,
        enhance: enhanceDocumentRef.current,
        ocr: runOcrRef.current,
      });
      steps[0] = { ...steps[0], status: "active" };
      setProgress({
        title:
          opts.title ??
          (isReplace ? "Podmiana strony" : "Przetwarzanie strony"),
        steps,
      });
    },
    [isReplace],
  );

  const patchStep = useCallback(
    (id: StepId, status: StepStatus, detail?: string) => {
      setProgress((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          steps: prev.steps.map((step) => {
            if (step.id !== id) return step;
            const next: ProcessStep = { ...step, status };
            if (detail !== undefined) next.detail = detail;
            else if (status === "active" || status === "done")
              delete next.detail;
            return next;
          }),
        };
      });
    },
    [],
  );

  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle("light");
      return () => {
        setStatusBarStyle("dark");
        if (progressClearTimerRef.current)
          clearTimeout(progressClearTimerRef.current);
        void ScreenOrientation.lockAsync(
          ScreenOrientation.OrientationLock.PORTRAIT_UP,
        );
      };
    }, []),
  );

  useEffect(() => {
    void ScreenOrientation.lockAsync(
      multiPageMode
        ? ScreenOrientation.OrientationLock.LANDSCAPE
        : ScreenOrientation.OrientationLock.PORTRAIT_UP,
    );
  }, [multiPageMode]);

  const setMultiPageModeOn = useCallback((on: boolean) => {
    if (on) {
      savedTogglesRef.current = {
        cropEdges: cropEdgesRef.current,
        enhanceDocument: enhanceDocumentRef.current,
        runOcr: runOcrRef.current,
      };
      setCropEdges(false);
      setEnhanceDocument(false);
      setRunOcr(false);
      setMultiPageMode(true);
      return;
    }
    const saved = savedTogglesRef.current;
    savedTogglesRef.current = null;
    setMultiPageMode(false);
    if (saved) {
      setCropEdges(saved.cropEdges);
      setEnhanceDocument(saved.enhanceDocument);
      setRunOcr(saved.runOcr);
    }
  }, []);

  const notifyOcrSkipped = useCallback((reason: "guest" | "quota") => {
    if (ocrHintAlertedRef.current) return;
    ocrHintAlertedRef.current = true;
    if (reason === "guest") {
      Alert.alert(
        "Tylko zdjęcia",
        "Bez konta zapisujesz skany lokalnie. Zaloguj się, aby odczytać tekst (OCR) i korzystać z AI.",
      );
      return;
    }
    Alert.alert(
      "Limit OCR",
      "Darmowy plan: 50 odczytów tekstu na miesiąc. OCR możesz uruchomić później (Pro = 10 000 / miesiąc).",
    );
  }, []);

  const tryOcr = useCallback(
    async (pageIndex: number, pageId: string, imageUri: string) => {
      if (!id) return;
      if (!isLoggedIn) {
        notifyOcrSkipped("guest");
        patchStep("ocr", "skipped", "wymaga konta");
        return;
      }
      if (!(await canRunOcr())) {
        notifyOcrSkipped("quota");
        patchStep("ocr", "skipped", "limit");
        return;
      }
      patchStep("ocr", "active");
      try {
        await runPageOcrExclusive(id, pageId, imageUri);
        patchStep("ocr", "done");
      } catch (error) {
        if (error instanceof OcrAuthRequiredError) {
          notifyOcrSkipped("guest");
          patchStep("ocr", "skipped", "wymaga konta");
        } else if (error instanceof OcrQuotaExceededError) {
          notifyOcrSkipped("quota");
          patchStep("ocr", "skipped", "limit");
        } else {
          throw error;
        }
      }
    },
    [id, isLoggedIn, notifyOcrSkipped, patchStep],
  );

  const leaveCapture = useCallback(() => {
    if (busy) return;
    router.back();
  }, [busy, router]);

  const saveProcessedUri = useCallback(
    async (
      saveUriPath: string,
      opts?: {
        skipOcr?: boolean;
        originalUri?: string | null;
        aiOnly?: boolean;
      },
    ) => {
      if (!id) return;
      const skipOcr = opts?.skipOcr === true;
      const originalOpts = {
        originalUri: opts?.originalUri ?? null,
        aiOnly: opts?.aiOnly === true,
      };

      patchStep("save", "active");

      // Lista biblioteki pokazuje książki z API bez lokalnego shella —
      // capture musi go mieć zanim readBook() w storage.
      await ensureLocalBook(id);

      if (isReplace) {
        const { page } = await replacePageFromCameraUri(
          id,
          replacePageId,
          saveUriPath,
          originalOpts,
        );
        patchStep("save", "done");
        if (!skipOcr) {
          if (page.imageUri?.trim()) {
            await tryOcr(page.index, page.id, page.imageUri);
          }
        } else {
          patchStep("ocr", "skipped", "wyłączony");
        }
        clearProgressSoon(700);
        router.replace(`/book/${id}/page/${page.id}`);
        return;
      }

      try {
        await assertCanAddPhoto(isPro);
      } catch (error) {
        patchStep("save", "skipped", "limit zdjęć");
        if (error instanceof PhotoQuotaExceededError) {
          Alert.alert("Limit zdjęć", error.message);
        } else {
          Alert.alert(
            "Limit zdjęć",
            "Nie udało się zapisać zdjęcia — sprawdź limit planu free.",
          );
        }
        clearProgressSoon();
        return;
      }

      const { page } = await addPageFromCameraUri(id, saveUriPath, originalOpts);
      void refreshPhotoQuota(isPro);
      setSessionCount((n) => n + 1);
      setProgress((prev) =>
        prev ? { ...prev, title: `Strona ${page.index}` } : prev,
      );
      patchStep("save", "done");

      if (skipOcr) {
        patchStep("ocr", "skipped", "wyłączony");
        clearProgressSoon();
        return;
      }

      if (page.imageUri?.trim()) {
        await tryOcr(page.index, page.id, page.imageUri);
      } else {
        patchStep("ocr", "skipped", "brak zdjęcia");
      }
      clearProgressSoon();
    },
    [
      clearProgressSoon,
      id,
      isPro,
      isReplace,
      patchStep,
      replacePageId,
      router,
      tryOcr,
    ],
  );

  const saveUri = useCallback(
    async (rawUri: string, originalUri?: string | null) => {
      if (!id) return;
      const uri = toFileUri(rawUri);
      const original = originalUri?.trim() ? toFileUri(originalUri) : null;
      const aiOnly = multiPageModeRef.current;

      setBusy(true);
      try {
        patchStep("capture", "done");
        const skipOcr = aiOnly || !runOcrRef.current;
        let savePath = uri;

        if (!aiOnly && enhanceDocumentRef.current) {
          patchStep("enhance", "active");
          savePath = await enhanceScanClarity(uri, { mode: "document" });
          patchStep("enhance", "done");
        } else {
          patchStep("enhance", "skipped", aiOnly ? "tryb wielu stron" : "wyłączona");
        }

        await saveProcessedUri(savePath, {
          originalUri: original,
          skipOcr,
          aiOnly,
        });
      } catch (error) {
        Alert.alert(
          "Błąd",
          error instanceof Error
            ? error.message
            : "Nie udało się zapisać skanu.",
        );
        setProgress(null);
      } finally {
        setBusy(false);
      }
    },
    [id, patchStep, saveProcessedUri],
  );

  const onShutter = useCallback(async () => {
    if (busy || shutterLockRef.current) return;
    shutterLockRef.current = true;
    setFlash(true);
    setTimeout(() => setFlash(false), 70);
    startProgress({
      title: isReplace ? "Podmiana strony" : "Przetwarzanie strony",
    });

    try {
      const result = await takePhoto();
      const croppedUri = result.image?.uri ?? null;
      const originalUri = result.originalImage?.uri ?? null;

      let workingUri: string | null;
      let keepOriginal: string | null;

      if (!multiPageModeRef.current && cropEdgesRef.current) {
        // Kadr do narożników + osobny oryginał pełnej klatki.
        workingUri = croppedUri ?? originalUri;
        keepOriginal = originalUri;
      } else {
        // Pełne zdjęcie bez przycinania (wymuszane w trybie wielu stron).
        workingUri = originalUri ?? croppedUri;
        keepOriginal = null;
      }

      if (!workingUri) {
        Alert.alert("Skan", "Nie udało się zrobić zdjęcia.");
        setProgress(null);
        return;
      }
      await saveUri(workingUri, keepOriginal);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        /native module|LiveDetect|null|undefined|TurboModule/i.test(message)
      ) {
        setNativeMissing(true);
        Alert.alert(
          "Wymagany nowy build",
          "Wbudowany skaner krawędzi wymaga nowego development clienta (EAS). Obecna aplikacja go nie zawiera.",
        );
      } else {
        Alert.alert("Błąd", message || "Nie udało się zeskanować strony.");
      }
      setProgress(null);
    } finally {
      shutterLockRef.current = false;
    }
  }, [busy, isReplace, saveUri, startProgress]);

  const onGallery = useCallback(async () => {
    if (busy) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 1,
    });
    if (result.canceled || !result.assets[0]?.uri) return;
    startProgress({
      fromGallery: true,
      title: isReplace ? "Podmiana strony" : "Przetwarzanie strony",
    });
    // Z galerii: oryginał = surowy wybór, kadr = po enhance.
    await saveUri(result.assets[0].uri, result.assets[0].uri);
  }, [busy, isReplace, saveUri, startProgress]);

  if (!permission) {
    return <View style={styles.root} />;
  }

  if (!permission.granted) {
    return (
      <View
        style={[
          styles.root,
          styles.permission,
          { paddingBottom: insets.bottom + space.xxl },
        ]}
      >
        <Gradient colors={gradients.brandVivid} style={styles.permIcon}>
          <Icon name="camera" size={28} color={colors.white} />
        </Gradient>
        <Text style={styles.permTitle}>Potrzebujemy dostępu do kamery</Text>
        <Text style={styles.permBody}>
          Skaner działa w aplikacji — live krawędzie strony i wyprostowanie po
          zdjęciu.
        </Text>
        <View style={styles.permActions}>
          <Button
            label="Udostępnij kamerę"
            icon="camera"
            onPress={() => void requestPermission()}
          />
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
            overlayColor={
              !multiPageMode && cropEdges
                ? "rgba(16, 191, 160, 0.95)"
                : "transparent"
            }
            overlayFillColor={
              !multiPageMode && cropEdges
                ? "rgba(16, 191, 160, 0.18)"
                : "transparent"
            }
            overlayStrokeWidth={!multiPageMode && cropEdges ? 3 : 0}
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

        <View
          pointerEvents="box-none"
          style={[styles.topBar, { paddingTop: insets.top + space.sm }]}
        >
          <IconButton
            name="close"
            accessibilityLabel={
              isReplace ? "Anuluj podmianę" : "Zakończ skanowanie"
            }
            variant="glass"
            size={44}
            round
            disabled={!canLeave}
            onPress={() => leaveCapture()}
          />
        </View>

        <View
          pointerEvents="none"
          style={[styles.statusChip, { top: insets.top + space.sm + 7 }]}
        >
          <View
            style={[
              styles.statusDot,
              multiPageMode || cropEdges || enhanceDocument || runOcr
                ? styles.statusDotOn
                : styles.statusDotOff,
            ]}
          />
          <Text style={styles.statusText}>
            {multiPageMode
              ? "Wiele stron · tylko AI · obróć telefon"
              : !cropEdges && !enhanceDocument && !runOcr
                ? "Zdjęcie → zapis"
                : !cropEdges
                  ? "Pełna klatka · bez kadrowania"
                  : enhanceDocument && runOcr
                    ? "Celuj w jedną stronę książki"
                    : enhanceDocument
                      ? "Dokument · bez szybkiego odczytu"
                      : runOcr
                        ? "Szybki odczyt · bez poprawy dokumentu"
                        : "Kadrowanie · bez poprawy i odczytu"}
          </Text>
        </View>

        {!progress ? (
          <View style={styles.scanToggles}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ checked: multiPageMode, disabled: busy }}
              accessibilityLabel={
                multiPageMode
                  ? "Tryb wielu stron włączony. Wyłącz, aby wrócić do skanu jednej strony."
                  : "Włącz tryb wielu stron — zdjęcie poziome, odczyt tylko AI."
              }
              disabled={busy}
              onPress={() => setMultiPageModeOn(!multiPageMode)}
              style={({ pressed }) => [
                styles.scanToggle,
                multiPageMode && styles.scanToggleOn,
                pressed && !busy ? styles.scanTogglePressed : null,
                busy && styles.disabled,
              ]}
            >
              <Icon
                name="bookOpen"
                size={14}
                color={multiPageMode ? colors.mint : "rgba(255,255,255,0.55)"}
              />
              <Text
                style={[
                  styles.scanToggleLabel,
                  multiPageMode && styles.scanToggleLabelOn,
                ]}
              >
                Wiele stron
              </Text>
            </Pressable>
            {!multiPageMode ? (
              <>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ checked: cropEdges, disabled: busy }}
                  accessibilityLabel={
                    cropEdges
                      ? "Kadrowanie włączone. Wyłącz, aby zapisać pełne zdjęcie."
                      : "Kadrowanie wyłączone. Włącz, aby przyciąć do narożników strony."
                  }
                  disabled={busy}
                  onPress={() => setCropEdges((v) => !v)}
                  style={({ pressed }) => [
                    styles.scanToggle,
                    cropEdges && styles.scanToggleOn,
                    pressed && !busy ? styles.scanTogglePressed : null,
                    busy && styles.disabled,
                  ]}
                >
                  <Icon
                    name="frame"
                    size={14}
                    color={cropEdges ? colors.mint : "rgba(255,255,255,0.55)"}
                  />
                  <Text
                    style={[
                      styles.scanToggleLabel,
                      cropEdges && styles.scanToggleLabelOn,
                    ]}
                  >
                    Kadrowanie
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{
                    checked: enhanceDocument,
                    disabled: busy,
                  }}
                  accessibilityLabel={
                    enhanceDocument
                      ? "Dokument włączony. Wyłącz, aby zapisać zwykłe zdjęcie."
                      : "Dokument wyłączony. Włącz, aby poprawić skan w locie."
                  }
                  disabled={busy}
                  onPress={() => setEnhanceDocument((v) => !v)}
                  style={({ pressed }) => [
                    styles.scanToggle,
                    enhanceDocument && styles.scanToggleOn,
                    pressed && !busy ? styles.scanTogglePressed : null,
                    busy && styles.disabled,
                  ]}
                >
                  <Icon
                    name="scan"
                    size={14}
                    color={
                      enhanceDocument ? colors.mint : "rgba(255,255,255,0.55)"
                    }
                  />
                  <Text
                    style={[
                      styles.scanToggleLabel,
                      enhanceDocument && styles.scanToggleLabelOn,
                    ]}
                  >
                    Dokument
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ checked: runOcr, disabled: busy }}
                  accessibilityLabel={
                    runOcr
                      ? "Szybki odczyt włączony. Wyłącz, aby tylko zapisać zdjęcie."
                      : "Szybki odczyt wyłączony. Włącz, aby odczytać tekst po skanie."
                  }
                  disabled={busy}
                  onPress={() => setRunOcr((v) => !v)}
                  style={({ pressed }) => [
                    styles.scanToggle,
                    runOcr && styles.scanToggleOn,
                    pressed && !busy ? styles.scanTogglePressed : null,
                    busy && styles.disabled,
                  ]}
                >
                  <Icon
                    name="text"
                    size={14}
                    color={runOcr ? colors.mint : "rgba(255,255,255,0.55)"}
                  />
                  <Text
                    style={[
                      styles.scanToggleLabel,
                      runOcr && styles.scanToggleLabelOn,
                    ]}
                  >
                    Szybki Odczyt
                  </Text>
                </Pressable>
              </>
            ) : null}
          </View>
        ) : null}

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
                const isActive = step.status === "active";
                const isDone = step.status === "done";
                const isSkipped = step.status === "skipped";
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
                      ]}
                    >
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
        style={[
          styles.bar,
          { paddingBottom: Math.max(insets.bottom, space.lg) },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Wybierz z galerii"
          disabled={busy}
          onPress={() => void onGallery()}
          style={({ pressed }) => [
            styles.sideButton,
            pressed && styles.sidePressed,
            busy && styles.disabled,
          ]}
        >
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
          ]}
        >
          <Gradient colors={gradients.brandVivid} style={styles.shutterRing}>
            <View style={[styles.shutterCore, busy && styles.shutterCoreBusy]}>
              {busy ? (
                <ActivityIndicator size="large" color={colors.mint} />
              ) : null}
            </View>
          </Gradient>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isReplace ? "Anuluj" : "Gotowe"}
          disabled={!canLeave}
          onPress={() => leaveCapture()}
          style={({ pressed }) => [
            styles.sideButton,
            pressed && styles.sidePressed,
            !canLeave && styles.disabled,
          ]}
        >
          <Icon
            name={isReplace ? "close" : "check"}
            size={22}
            color={colors.white}
          />
          <Text style={styles.sideLabel}>
            {isReplace
              ? "Anuluj"
              : sessionCount > 0
                ? `Gotowe · ${sessionCount}`
                : "Gotowe"}
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
    backgroundColor: "#000",
    overflow: "hidden",
  },
  missing: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.xxl,
    gap: space.sm,
    backgroundColor: colors.nightSoft,
  },
  missingTitle: {
    color: colors.white,
    fontSize: 18,
    fontWeight: "800",
  },
  missingBody: {
    color: "rgba(255,255,255,0.7)",
    textAlign: "center",
    fontSize: 14,
    lineHeight: 20,
  },
  flash: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#fff",
    opacity: 0.5,
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.lg,
  },
  scanToggles: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: space.xl,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    paddingHorizontal: space.lg,
  },
  scanToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: "rgba(10, 12, 20, 0.72)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  scanToggleOn: {
    backgroundColor: "rgba(16, 191, 160, 0.22)",
    borderColor: "rgba(16, 191, 160, 0.7)",
  },
  scanTogglePressed: {
    opacity: 0.75,
  },
  scanToggleLabel: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 12.5,
    fontWeight: "700",
  },
  scanToggleLabelOn: {
    color: colors.mint,
  },
  statusChip: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: space.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: "rgba(10, 12, 20, 0.72)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
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
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  statusText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: "700",
  },
  progressCard: {
    position: "absolute",
    left: space.xl,
    right: space.xl,
    bottom: space.xl,
    backgroundColor: "rgba(10, 12, 20, 0.88)",
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    gap: space.sm,
  },
  progressHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
    marginBottom: 2,
  },
  progressTitle: {
    flex: 1,
    color: colors.white,
    fontSize: 13.5,
    fontWeight: "800",
  },
  progressMeta: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 12,
    fontWeight: "600",
  },
  progressList: {
    gap: 8,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  progressGlyph: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  stepDotPending: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.28)",
  },
  stepDotSkipped: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  stepDotSkippedInner: {
    width: 7,
    height: 1.5,
    borderRadius: 1,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  progressLabel: {
    flex: 1,
    color: "rgba(255,255,255,0.55)",
    fontSize: 13,
    fontWeight: "600",
  },
  progressLabelActive: {
    color: colors.white,
    fontWeight: "700",
  },
  progressLabelDone: {
    color: "rgba(255,255,255,0.92)",
  },
  progressLabelSkipped: {
    color: "rgba(255,255,255,0.42)",
  },
  progressDetail: {
    color: "rgba(255,255,255,0.42)",
    fontSize: 11.5,
    fontWeight: "600",
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.xl,
    paddingTop: space.lg,
  },
  sideButton: {
    width: 82,
    alignItems: "center",
    gap: 5,
    paddingVertical: space.sm,
    borderRadius: radius.md,
  },
  sidePressed: {
    opacity: 0.6,
  },
  sideLabel: {
    color: "rgba(255,255,255,0.86)",
    fontSize: 12,
    fontWeight: "700",
  },
  disabled: {
    opacity: 0.38,
  },
  shutterWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  shutterRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.float,
  },
  shutterCore: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  shutterCoreBusy: {
    backgroundColor: "rgba(255,255,255,0.92)",
  },
  shutterPressed: {
    transform: [{ scale: 0.94 }],
  },
  permission: {
    justifyContent: "center",
    paddingHorizontal: space.xxl,
    gap: space.md,
  },
  permIcon: {
    width: 58,
    height: 58,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.sm,
  },
  permTitle: {
    color: colors.white,
    fontSize: 23,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  permBody: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 15,
    lineHeight: 22,
  },
  permActions: {
    marginTop: space.lg,
    gap: space.md,
  },
});
