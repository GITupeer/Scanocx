/**
 * Ręczna korekcja skanu (Admin Mode): podgląd + suwaki bez OCR.
 * Modal — żeby wyjść nad natywną kamerę (SurfaceView).
 */
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { GestureResponderEvent, LayoutChangeEvent } from 'react-native';
import {
  SafeAreaProvider,
  SafeAreaView,
  initialWindowMetrics,
} from 'react-native-safe-area-context';

import {
  enhanceScanClarity,
  type EnhanceScanClarityOptions,
} from '@/src/images/enhanceScanClarity';

import { Button, IconButton } from './Button';
import { Gradient } from './Gradient';
import { Icon } from './Icon';
import { colors, gradients, radius, space } from './theme';

export type AdminEnhanceParams = Required<
  Pick<EnhanceScanClarityOptions, 'contrast' | 'saturation' | 'brightness'>
> & {
  mode: 'document' | 'photo';
};

const NEUTRAL: AdminEnhanceParams = {
  mode: 'document',
  contrast: 1,
  saturation: 1,
  brightness: 0,
};

/** Jak Google Drive „Dokument” — biały papier. */
const DOCUMENT_PRESET: AdminEnhanceParams = {
  mode: 'document',
  contrast: 1.72,
  saturation: 0.42,
  brightness: 10,
};

const PHOTO_PRESET: AdminEnhanceParams = {
  mode: 'photo',
  contrast: 1.35,
  saturation: 1.0,
  brightness: 6,
};

/** Szybki podgląd — mniejszy maxEdge. */
const PREVIEW_MAX_EDGE = 900;

type Props = {
  uri: string;
  busy?: boolean;
  onCancel: () => void;
  onSave: (uri: string, params: AdminEnhanceParams) => void;
};

function toDisplayUri(path: string): string {
  if (!path) return path;
  if (
    path.startsWith('file://') ||
    path.startsWith('content://') ||
    path.startsWith('data:') ||
    path.startsWith('http')
  ) {
    return path;
  }
  return `file://${path}`;
}

function isNeutral(p: AdminEnhanceParams): boolean {
  return (
    Math.abs(p.contrast - 1) < 0.01 &&
    Math.abs(p.saturation - 1) < 0.01 &&
    Math.abs(p.brightness) < 0.5
  );
}

function ParamSlider({
  label,
  value,
  min,
  max,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const widthRef = useRef(1);
  const startRef = useRef(value);
  const minRef = useRef(min);
  const maxRef = useRef(max);
  const onChangeRef = useRef(onChange);
  minRef.current = min;
  maxRef.current = max;
  onChangeRef.current = onChange;
  const [trackW, setTrackW] = useState(1);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e: GestureResponderEvent) => {
        const lo = minRef.current;
        const hi = maxRef.current;
        const t = Math.max(0, Math.min(1, e.nativeEvent.locationX / widthRef.current));
        startRef.current = lo + t * (hi - lo);
        onChangeRef.current(startRef.current);
      },
      onPanResponderMove: (_e, gesture) => {
        const lo = minRef.current;
        const hi = maxRef.current;
        const delta = (gesture.dx / widthRef.current) * (hi - lo);
        const next = Math.max(lo, Math.min(hi, startRef.current + delta));
        onChangeRef.current(next);
      },
    })
  ).current;

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    widthRef.current = Math.max(1, w);
    setTrackW(Math.max(1, w));
  };

  const ratio = (value - min) / (max - min);
  const thumbLeft = Math.max(0, Math.min(trackW - 18, ratio * trackW - 9));

  return (
    <View style={styles.sliderBlock}>
      <View style={styles.sliderHeader}>
        <Text style={styles.sliderLabel}>{label}</Text>
        <Text style={styles.sliderValue}>{format(value)}</Text>
      </View>
      <View style={styles.trackHit} onLayout={onLayout} {...pan.panHandlers}>
        <View style={styles.track}>
          <View style={[styles.trackFill, { flex: Math.max(0.001, ratio) }]} />
          <View style={{ flex: Math.max(0.001, 1 - ratio) }} />
        </View>
        <View style={[styles.thumb, { left: thumbLeft }]} />
      </View>
    </View>
  );
}

function EditorBody({ uri, busy = false, onCancel, onSave }: Props) {
  const sourceUri = toDisplayUri(uri);
  const [params, setParams] = useState<AdminEnhanceParams>(DOCUMENT_PRESET);
  const [previewUri, setPreviewUri] = useState(sourceUri);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const genRef = useRef(0);
  const paramsRef = useRef(params);
  paramsRef.current = params;

  useEffect(() => {
    setParams(DOCUMENT_PRESET);
    setPreviewUri(sourceUri);
    setPreviewError(null);
  }, [sourceUri]);

  useEffect(() => {
    const gen = ++genRef.current;
    if (isNeutral(params)) {
      setPreviewUri(sourceUri);
      setPreviewBusy(false);
      setPreviewError(null);
      return;
    }

    const timer = setTimeout(() => {
      void (async () => {
        setPreviewBusy(true);
        setPreviewError(null);
        try {
          const next = await enhanceScanClarity(sourceUri, {
            ...paramsRef.current,
            maxEdge: PREVIEW_MAX_EDGE,
          });
          if (genRef.current === gen) setPreviewUri(toDisplayUri(next));
        } catch (error) {
          if (genRef.current === gen) {
            setPreviewError(error instanceof Error ? error.message : 'Błąd podglądu');
          }
        } finally {
          if (genRef.current === gen) setPreviewBusy(false);
        }
      })();
    }, 120);

    return () => clearTimeout(timer);
  }, [sourceUri, params.mode, params.contrast, params.saturation, params.brightness]);

  const applySave = async () => {
    if (busy) return;
    setPreviewBusy(true);
    try {
      const finalUri = isNeutral(params)
        ? sourceUri
        : await enhanceScanClarity(sourceUri, params);
      onSave(toDisplayUri(finalUri), params);
    } finally {
      setPreviewBusy(false);
    }
  };

  const locked = busy || previewBusy;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.topBar}>
        <IconButton
          name="close"
          accessibilityLabel="Anuluj"
          variant="glass"
          size={44}
          round
          disabled={busy}
          onPress={onCancel}
        />
        <View style={styles.badge}>
          <Icon name="tune" size={14} color={colors.white} />
          <Text style={styles.badgeText}>Admin Mode</Text>
        </View>
        <View style={{ width: 44 }} />
      </View>

      <View style={styles.imageBox}>
        <Image
          key={previewUri}
          source={{ uri: previewUri }}
          style={styles.image}
          resizeMode="contain"
        />
        {previewBusy ? (
          <View style={styles.previewOverlay} pointerEvents="none">
            <ActivityIndicator color={colors.mint} size="large" />
            <Text style={styles.previewBusyText}>Przeliczam…</Text>
          </View>
        ) : null}
        {previewError ? (
          <View style={styles.errorBanner} pointerEvents="none">
            <Text style={styles.errorText}>{previewError}</Text>
          </View>
        ) : null}
      </View>

      <Gradient
        colors={gradients.night}
        angle={180}
        fallbackColor={colors.night}
        style={styles.panel}>
        <ParamSlider
          label="Kontrast"
          value={params.contrast}
          min={0.6}
          max={2.4}
          format={(v) => v.toFixed(2)}
          onChange={(contrast) => setParams((p) => ({ ...p, contrast }))}
        />
        <ParamSlider
          label="Biel / jasność"
          value={params.brightness}
          min={-40}
          max={40}
          format={(v) => `${v > 0 ? '+' : ''}${Math.round(v)}`}
          onChange={(brightness) => setParams((p) => ({ ...p, brightness }))}
        />
        <ParamSlider
          label="Nasycenie"
          value={params.saturation}
          min={0}
          max={2}
          format={(v) => v.toFixed(2)}
          onChange={(saturation) => setParams((p) => ({ ...p, saturation }))}
        />

        <View style={styles.presets}>
          <Pressable
            accessibilityRole="button"
            disabled={locked}
            onPress={() => setParams(NEUTRAL)}
            style={({ pressed }) => [styles.presetBtn, pressed && styles.pressed, locked && styles.dim]}>
            <Text style={styles.presetText}>Oryginał</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={locked}
            onPress={() => setParams(DOCUMENT_PRESET)}
            style={({ pressed }) => [
              styles.presetBtn,
              styles.presetBtnActive,
              pressed && styles.pressed,
              locked && styles.dim,
            ]}>
            <Text style={styles.presetText}>Dokument</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={locked}
            onPress={() => setParams(PHOTO_PRESET)}
            style={({ pressed }) => [styles.presetBtn, pressed && styles.pressed, locked && styles.dim]}>
            <Text style={styles.presetText}>Zdjęcie</Text>
          </Pressable>
        </View>

        <View style={styles.actions}>
          <Button
            label="Anuluj"
            variant="glass"
            onPress={onCancel}
            disabled={busy}
            style={styles.actionBtn}
          />
          <Button
            label="Zapisz"
            icon="check"
            onPress={() => void applySave()}
            loading={busy}
            disabled={previewBusy}
            style={styles.actionBtn}
          />
        </View>
      </Gradient>
    </SafeAreaView>
  );
}

export function AdminScanEditor(props: Props) {
  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
      hardwareAccelerated
      onRequestClose={props.onCancel}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <View style={styles.modalRoot}>
          <EditorBody {...props} />
        </View>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    backgroundColor: '#000',
  },
  safe: {
    flex: 1,
    backgroundColor: '#000',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    marginBottom: space.sm,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(16, 191, 160, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(16, 191, 160, 0.45)',
  },
  badgeText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '800',
  },
  imageBox: {
    flex: 1,
    minHeight: 200,
    marginHorizontal: space.md,
    marginBottom: space.sm,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  previewOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  previewBusyText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '700',
  },
  errorBanner: {
    position: 'absolute',
    left: space.md,
    right: space.md,
    bottom: space.md,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: 'rgba(180,40,40,0.85)',
  },
  errorText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  panel: {
    flexShrink: 0,
    paddingHorizontal: space.xl,
    paddingTop: space.lg,
    paddingBottom: space.md,
    gap: space.md,
  },
  sliderBlock: {
    gap: 6,
  },
  sliderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sliderLabel: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 13,
    fontWeight: '700',
  },
  sliderValue: {
    color: colors.mint,
    fontSize: 13,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  trackHit: {
    height: 28,
    justifyContent: 'center',
  },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.16)',
    overflow: 'hidden',
    flexDirection: 'row',
  },
  trackFill: {
    height: '100%',
    backgroundColor: colors.mint,
    borderRadius: 3,
  },
  thumb: {
    position: 'absolute',
    top: 5,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.mint,
  },
  presets: {
    flexDirection: 'row',
    gap: space.sm,
  },
  presetBtn: {
    paddingHorizontal: space.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  presetBtnActive: {
    backgroundColor: 'rgba(16, 191, 160, 0.22)',
    borderColor: 'rgba(16, 191, 160, 0.5)',
  },
  presetText: {
    color: colors.white,
    fontSize: 12.5,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.65,
  },
  dim: {
    opacity: 0.4,
  },
  actions: {
    flexDirection: 'row',
    gap: space.md,
    marginTop: space.sm,
  },
  actionBtn: {
    flex: 1,
  },
});
