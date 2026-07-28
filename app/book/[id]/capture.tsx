/**
 * Ekran skanowania — Capture v2
 *
 * Spust: tylko takePictureAsync.
 * W tle: crop do ramki → zapis.
 * OCR czeka w kolejce i startuje po wyjściu z trybu zdjęć — inaczej rozpoznawanie
 * blokowałoby wątek JS na kilka sekund w środku sesji.
 */
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CAPTURE_V2_GUIDE, pickFastPictureSize, snapCameraV2 } from '@/src/capture/v2';
import { cropToGuide } from '@/src/images/cropToGuide';
import { enqueueOcr, holdOcrQueue, releaseOcrQueue, useOcrQueue } from '@/src/ocr/queue';
import { addPageFromCameraUri, replacePageFromCameraUri } from '@/src/storage/books';
import {
  Badge,
  Button,
  Gradient,
  Icon,
  IconButton,
  ScanBeam,
  colors,
  gradients,
  radius,
  shadow,
  space,
} from '@/src/ui';

const PREVIEW_ASPECT = 3 / 4; // portretowy kadr 3:4 (kamera ratio 4:3)

type Job = {
  uri: string;
  crop: boolean;
  exifOrientation?: number | null;
};

export default function CaptureScreenV2() {
  const { id, replacePageId } = useLocalSearchParams<{ id: string; replacePageId?: string }>();
  const isReplace = typeof replacePageId === 'string' && replacePageId.length > 0;
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const cameraRef = useRef<CameraView>(null);
  const queueRef = useRef<Job[]>([]);
  const workingRef = useRef(false);

  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const [pictureSize, setPictureSize] = useState<string | undefined>();
  const [torch, setTorch] = useState(false);
  const [snapping, setSnapping] = useState(false);
  const [flash, setFlash] = useState(false);
  const [pending, setPending] = useState(0);
  const [sessionCount, setSessionCount] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const [area, setArea] = useState({ width: 0, height: 0 });

  const ocrQueue = useOcrQueue();
  const awaitingOcr = ocrQueue.remaining;

  // Dopóki kamera jest na wierzchu, OCR stoi. Rusza przy wyjściu z ekranu.
  // Ciemny ekran potrzebuje też jasnych ikon paska statusu.
  useFocusEffect(
    useCallback(() => {
      holdOcrQueue();
      setStatusBarStyle('light');
      return () => {
        releaseOcrQueue();
        setStatusBarStyle('dark');
      };
    }, [])
  );

  const previewSize = useMemo(() => {
    if (area.width <= 0 || area.height <= 0) return { width: 0, height: 0 };
    if (area.width / area.height > PREVIEW_ASPECT) {
      const height = area.height;
      return { width: height * PREVIEW_ASPECT, height };
    }
    const width = area.width;
    return { width, height: width / PREVIEW_ASPECT };
  }, [area]);

  const onAreaLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setArea((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
  };

  const onCameraReady = useCallback(async () => {
    setCameraReady(true);
    try {
      const sizes = await cameraRef.current?.getAvailablePictureSizesAsync();
      if (sizes?.length) {
        const picked = pickFastPictureSize(sizes);
        if (picked) setPictureSize(picked);
      }
    } catch {
      // domyślny rozmiar
    }
  }, []);

  const processQueue = useCallback(async () => {
    if (workingRef.current) return;
    workingRef.current = true;

    while (queueRef.current.length > 0) {
      const job = queueRef.current.shift();
      if (!job || !id) continue;

      try {
        const preparedUri = job.crop
          ? await cropToGuide(job.uri, CAPTURE_V2_GUIDE, {
              exifOrientation: job.exifOrientation,
            })
          : job.uri;

        if (isReplace) {
          const { page } = await replacePageFromCameraUri(id, replacePageId, preparedUri);
          setHint(`Podmieniono stronę ${page.index}`);
          enqueueOcr({
            bookId: id,
            pageId: page.id,
            pageIndex: page.index,
            imageUri: page.imageUri,
          });
          router.replace(`/book/${id}/page/${page.id}`);
          break;
        }

        const { page } = await addPageFromCameraUri(id, preparedUri);
        setSessionCount((n) => n + 1);
        setHint(`Zapisano stronę ${page.index}`);
        enqueueOcr({
          bookId: id,
          pageId: page.id,
          pageIndex: page.index,
          imageUri: page.imageUri,
        });
      } catch (error) {
        Alert.alert('Błąd', error instanceof Error ? error.message : 'Zapis nieudany.');
      } finally {
        setPending((n) => Math.max(0, n - 1));
      }
    }

    workingRef.current = false;
  }, [id, isReplace, replacePageId, router]);

  const enqueue = useCallback(
    (job: Job) => {
      queueRef.current.push(job);
      setPending((n) => n + 1);
      void processQueue();
    },
    [processQueue]
  );

  const onShutter = useCallback(async () => {
    const cam = cameraRef.current;
    if (!cam || !cameraReady || snapping) return;

    setSnapping(true);
    try {
      const shot = await snapCameraV2(cam);
      if (!shot) return;

      setFlash(true);
      setTimeout(() => setFlash(false), 80);
      setHint(isReplace ? 'Podmieniam…' : 'Zrobione');
      enqueue({ uri: shot.uri, crop: true, exifOrientation: shot.exifOrientation });
    } catch (error) {
      Alert.alert('Błąd', error instanceof Error ? error.message : 'Nie udało się zrobić zdjęcia.');
    } finally {
      setSnapping(false);
    }
  }, [cameraReady, enqueue, isReplace, snapping]);

  const onGallery = useCallback(async () => {
    if (snapping || pending > 0) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
    });
    if (result.canceled || !result.assets[0]?.uri) return;
    enqueue({ uri: result.assets[0].uri, crop: false });
  }, [enqueue, pending, snapping]);

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
          Scanocx skanuje strony lokalnie — zdjęcia nie opuszczają urządzenia.
        </Text>
        <View style={styles.permActions}>
          <Button label="Udostępnij kamerę" icon="camera" onPress={() => void requestPermission()} />
          <Button
            label="Wybierz z galerii"
            icon="gallery"
            variant="glass"
            onPress={() => void onGallery()}
          />
          <Button label="Wróć" variant="glass" onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  const guide = CAPTURE_V2_GUIDE;
  const guideHeightPx = Math.round(previewSize.height * guide.height);
  const canLeave = !snapping && pending === 0;

  return (
    <View style={styles.root}>
      <View style={styles.stage} onLayout={onAreaLayout}>
        {previewSize.width > 0 ? (
          <View
            style={[styles.previewFrame, { width: previewSize.width, height: previewSize.height }]}>
            <CameraView
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              facing="back"
              mode="picture"
              ratio="4:3"
              pictureSize={pictureSize}
              enableTorch={torch}
              animateShutter={false}
              onCameraReady={() => {
                void onCameraReady();
              }}
            />

            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              <View style={[styles.dim, { top: 0, left: 0, right: 0, height: `${guide.y * 100}%` }]} />
              <View
                style={[
                  styles.dim,
                  {
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: `${(1 - guide.y - guide.height) * 100}%`,
                  },
                ]}
              />
              <View
                style={[
                  styles.dim,
                  {
                    top: `${guide.y * 100}%`,
                    bottom: `${(1 - guide.y - guide.height) * 100}%`,
                    left: 0,
                    width: `${guide.x * 100}%`,
                  },
                ]}
              />
              <View
                style={[
                  styles.dim,
                  {
                    top: `${guide.y * 100}%`,
                    bottom: `${(1 - guide.y - guide.height) * 100}%`,
                    right: 0,
                    width: `${(1 - guide.x - guide.width) * 100}%`,
                  },
                ]}
              />

              <View
                style={[
                  styles.guide,
                  {
                    top: `${guide.y * 100}%`,
                    left: `${guide.x * 100}%`,
                    width: `${guide.width * 100}%`,
                    height: `${guide.height * 100}%`,
                  },
                ]}>
                <ScanBeam height={guideHeightPx} active={cameraReady && !snapping} />
                <View style={[styles.corner, styles.cornerTL]} />
                <View style={[styles.corner, styles.cornerTR]} />
                <View style={[styles.corner, styles.cornerBL]} />
                <View style={[styles.corner, styles.cornerBR]} />
              </View>
            </View>

            {flash ? <View pointerEvents="none" style={styles.flash} /> : null}
          </View>
        ) : null}

        <View pointerEvents="box-none" style={[styles.topBar, { paddingTop: insets.top + space.sm }]}>
          <IconButton
            name="close"
            accessibilityLabel={isReplace ? 'Anuluj podmianę' : 'Zakończ skanowanie'}
            variant="glass"
            size={44}
            round
            disabled={!canLeave}
            onPress={() => router.back()}
          />

          <View style={styles.topCenter}>
            <Badge
              label={isReplace ? 'Podmiana strony' : 'Skanowanie stron'}
              tone="glass"
              icon="frame"
              size="md"
            />
          </View>

          <IconButton
            name={torch ? 'torchOn' : 'torchOff'}
            accessibilityLabel={torch ? 'Wyłącz latarkę' : 'Włącz latarkę'}
            variant="glass"
            size={44}
            round
            tint={torch ? colors.warning : colors.white}
            onPress={() => setTorch((value) => !value)}
          />
        </View>

        {awaitingOcr > 0 ? (
          <View pointerEvents="none" style={[styles.queueChip, { top: insets.top + 68 }]}>
            <Icon name="ai" size={13} color={colors.white} />
            <Text style={styles.queueChipText}>
              Do analizy: {awaitingOcr}
              {isReplace ? '' : ' · start po „Gotowe”'}
            </Text>
          </View>
        ) : null}

        {hint ? (
          <View pointerEvents="none" style={styles.toast}>
            <Icon name="check" size={14} color={colors.white} />
            <Text style={styles.toastText}>
              {hint}
              {!isReplace && sessionCount > 0 ? ` · zdjęć: ${sessionCount}` : ''}
              {pending > 0 ? ` · zapis: ${pending}` : ''}
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
          disabled={snapping || (isReplace && pending > 0)}
          onPress={() => void onGallery()}
          style={({ pressed }) => [
            styles.sideButton,
            pressed && styles.sidePressed,
            (snapping || (isReplace && pending > 0)) && styles.disabled,
          ]}>
          <Icon name="gallery" size={22} color={colors.white} />
          <Text style={styles.sideLabel}>Galeria</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Zrób zdjęcie"
          disabled={!cameraReady || snapping}
          onPress={() => void onShutter()}
          style={({ pressed }) => [
            styles.shutterWrap,
            (!cameraReady || snapping) && styles.disabled,
            pressed && cameraReady && !snapping ? styles.shutterPressed : null,
          ]}>
          <Gradient colors={gradients.brandVivid} style={styles.shutterRing}>
            <View style={[styles.shutterCore, snapping && styles.shutterCoreBusy]} />
          </Gradient>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isReplace ? 'Anuluj' : 'Gotowe'}
          disabled={!canLeave}
          onPress={() => router.back()}
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
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  previewFrame: {
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  dim: {
    position: 'absolute',
    backgroundColor: 'rgba(4, 5, 12, 0.55)',
  },
  guide: {
    position: 'absolute',
    borderRadius: radius.xs,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
    overflow: 'hidden',
  },
  corner: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderColor: colors.white,
  },
  cornerTL: {
    top: -1,
    left: -1,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: radius.xs,
  },
  cornerTR: {
    top: -1,
    right: -1,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: radius.xs,
  },
  cornerBL: {
    bottom: -1,
    left: -1,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: radius.xs,
  },
  cornerBR: {
    bottom: -1,
    right: -1,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: radius.xs,
  },
  flash: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#fff',
    opacity: 0.55,
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
  queueChip: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(108, 76, 241, 0.92)',
    ...shadow.soft,
  },
  queueChipText: {
    color: colors.white,
    fontSize: 12.5,
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
  },
  shutterCoreBusy: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.85)',
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
