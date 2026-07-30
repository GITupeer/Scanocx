import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import {
  Image,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

import { colors, shadow } from './theme';

export type CropPoint = { x: number; y: number };

export type CropQuad = {
  topLeft: CropPoint;
  topRight: CropPoint;
  bottomRight: CropPoint;
  bottomLeft: CropPoint;
};

export type CornerCropEditorHandle = {
  getQuad: () => CropQuad | null;
};

type LayoutInfo = {
  scale: number;
  offsetX: number;
  offsetY: number;
  renderWidth: number;
  renderHeight: number;
};

type Props = {
  imageUri: string;
  imageWidth: number;
  imageHeight: number;
  /** Współrzędne w pikselach obrazu. Domyślnie lekko wcięty prostokąt. */
  initialQuad?: CropQuad | null;
  onReadyChange?: (ready: boolean) => void;
};

const HANDLE = 36;
const HALF_HANDLE = HANDLE / 2;
const EDGE = 2.5;
const INSET = 0.06;

function defaultQuad(width: number, height: number): CropQuad {
  const ix = width * INSET;
  const iy = height * INSET;
  return {
    topLeft: { x: ix, y: iy },
    topRight: { x: width - ix, y: iy },
    bottomRight: { x: width - ix, y: height - iy },
    bottomLeft: { x: ix, y: height - iy },
  };
}

/**
 * Edytor kadru: 4 przesuwane rogi na podglądzie zdjęcia (contain).
 * `getQuad()` zwraca współrzędne w przestrzeni obrazu źródłowego.
 */
export const CornerCropEditor = forwardRef<CornerCropEditorHandle, Props>(
  function CornerCropEditor(
    { imageUri, imageWidth, imageHeight, initialQuad, onReadyChange },
    ref
  ) {
    const [layout, setLayout] = useState<LayoutInfo | null>(null);
    const initializedRef = useRef(false);

    const tl = useSharedValue({ x: 0, y: 0 });
    const tr = useSharedValue({ x: 0, y: 0 });
    const br = useSharedValue({ x: 0, y: 0 });
    const bl = useSharedValue({ x: 0, y: 0 });

    const bounds = useSharedValue({
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0,
    });

    const onLayout = useCallback(
      (event: LayoutChangeEvent) => {
        const { width, height } = event.nativeEvent.layout;
        if (width <= 0 || height <= 0 || imageWidth <= 0 || imageHeight <= 0) return;

        const scale = Math.min(width / imageWidth, height / imageHeight);
        const renderWidth = imageWidth * scale;
        const renderHeight = imageHeight * scale;
        const offsetX = (width - renderWidth) / 2;
        const offsetY = (height - renderHeight) / 2;

        if (initializedRef.current) return;

        const next: LayoutInfo = { scale, offsetX, offsetY, renderWidth, renderHeight };
        initializedRef.current = true;

        setLayout(next);
        bounds.value = {
          minX: offsetX,
          minY: offsetY,
          maxX: offsetX + renderWidth,
          maxY: offsetY + renderHeight,
        };

        const source = initialQuad ?? defaultQuad(imageWidth, imageHeight);
        const toScreen = (p: CropPoint) => ({
          x: p.x * scale + offsetX,
          y: p.y * scale + offsetY,
        });
        tl.value = toScreen(source.topLeft);
        tr.value = toScreen(source.topRight);
        br.value = toScreen(source.bottomRight);
        bl.value = toScreen(source.bottomLeft);
        onReadyChange?.(true);
      },
      [bl, bounds, br, imageHeight, imageWidth, initialQuad, onReadyChange, tl, tr]
    );

    useImperativeHandle(
      ref,
      () => ({
        getQuad: () => {
          if (!layout) return null;
          const { scale, offsetX, offsetY } = layout;
          const toImage = (p: CropPoint) => ({
            x: Math.max(0, Math.min(imageWidth, (p.x - offsetX) / scale)),
            y: Math.max(0, Math.min(imageHeight, (p.y - offsetY) / scale)),
          });
          return {
            topLeft: toImage(tl.value),
            topRight: toImage(tr.value),
            bottomRight: toImage(br.value),
            bottomLeft: toImage(bl.value),
          };
        },
      }),
      [bl, br, imageHeight, imageWidth, layout, tl, tr]
    );

    return (
      <View style={styles.root} onLayout={onLayout}>
        {layout ? (
          <Image
            source={{ uri: imageUri }}
            style={{
              position: 'absolute',
              left: layout.offsetX,
              top: layout.offsetY,
              width: layout.renderWidth,
              height: layout.renderHeight,
            }}
            resizeMode="stretch"
          />
        ) : null}

        {layout ? (
          <>
            <Edge a={tl} b={tr} />
            <Edge a={tr} b={br} />
            <Edge a={br} b={bl} />
            <Edge a={bl} b={tl} />
            <Handle point={tl} bounds={bounds} />
            <Handle point={tr} bounds={bounds} />
            <Handle point={br} bounds={bounds} />
            <Handle point={bl} bounds={bounds} />
          </>
        ) : null}
      </View>
    );
  }
);

function Edge({
  a,
  b,
}: {
  a: SharedValue<CropPoint>;
  b: SharedValue<CropPoint>;
}) {
  const style = useAnimatedStyle(() => {
    const dx = b.value.x - a.value.x;
    const dy = b.value.y - a.value.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    return {
      width: Math.max(length, 1),
      left: (a.value.x + b.value.x) / 2 - length / 2,
      top: (a.value.y + b.value.y) / 2 - EDGE / 2,
      transform: [{ rotate: `${angle}deg` }],
    };
  });

  return <Animated.View pointerEvents="none" style={[styles.edge, style]} />;
}

function Handle({
  point,
  bounds,
}: {
  point: SharedValue<CropPoint>;
  bounds: SharedValue<{ minX: number; minY: number; maxX: number; maxY: number }>;
}) {
  const start = useSharedValue({ x: 0, y: 0 });

  const gesture = Gesture.Pan()
    .onBegin(() => {
      start.value = { x: point.value.x, y: point.value.y };
    })
    .onUpdate((e) => {
      const b = bounds.value;
      const x = Math.max(b.minX, Math.min(b.maxX, start.value.x + e.translationX));
      const y = Math.max(b.minY, Math.min(b.maxY, start.value.y + e.translationY));
      point.value = { x, y };
    });

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: point.value.x - HALF_HANDLE },
      { translateY: point.value.y - HALF_HANDLE },
    ],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[styles.handle, style]}>
        <View style={styles.handleDot} />
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: colors.surfaceSunken,
  },
  edge: {
    position: 'absolute',
    height: EDGE,
    backgroundColor: colors.primary,
    borderRadius: 1,
    opacity: 0.95,
  },
  handle: {
    position: 'absolute',
    width: HANDLE,
    height: HANDLE,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  handleDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.primary,
    borderWidth: 2.5,
    borderColor: colors.white,
    ...shadow.soft,
  },
});
