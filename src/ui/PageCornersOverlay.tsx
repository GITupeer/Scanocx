/**
 * Ramki czworokątów stron wykrytych przez AI (współrzędne 0–1).
 * Rysowane liniami View — bez zależności od SVG.
 */
import { useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

import type { AiPageCorners, AiPageText } from '@/src/domain/types';
import { colors } from './theme';

const FRAME_COLORS = [
  colors.mint,
  '#5B8CFF',
  '#F0A202',
  '#E4572E',
  '#9B5DE5',
] as const;

type Props = {
  pages: AiPageText[] | undefined;
  /** Grubość linii w px. */
  strokeWidth?: number;
  /** Pokaż numer strony przy lewym górnym rogu. */
  showLabels?: boolean;
};

function Line({
  x1,
  y1,
  x2,
  y2,
  color,
  thickness,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  thickness: number;
}) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length < 0.5) return null;
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: (x1 + x2) / 2 - length / 2,
        top: (y1 + y2) / 2 - thickness / 2,
        width: length,
        height: thickness,
        backgroundColor: color,
        borderRadius: thickness / 2,
        transform: [{ rotate: `${angle}deg` }],
      }}
    />
  );
}

function QuadFrame({
  corners,
  width,
  height,
  color,
  thickness,
  label,
}: {
  corners: AiPageCorners;
  width: number;
  height: number;
  color: string;
  thickness: number;
  label?: string;
}) {
  const tl = { x: corners.topLeft.x * width, y: corners.topLeft.y * height };
  const tr = { x: corners.topRight.x * width, y: corners.topRight.y * height };
  const br = { x: corners.bottomRight.x * width, y: corners.bottomRight.y * height };
  const bl = { x: corners.bottomLeft.x * width, y: corners.bottomLeft.y * height };

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Line x1={tl.x} y1={tl.y} x2={tr.x} y2={tr.y} color={color} thickness={thickness} />
      <Line x1={tr.x} y1={tr.y} x2={br.x} y2={br.y} color={color} thickness={thickness} />
      <Line x1={br.x} y1={br.y} x2={bl.x} y2={bl.y} color={color} thickness={thickness} />
      <Line x1={bl.x} y1={bl.y} x2={tl.x} y2={tl.y} color={color} thickness={thickness} />
      {label ? (
        <View
          style={[
            styles.label,
            {
              left: Math.max(4, tl.x + 4),
              top: Math.max(4, tl.y + 4),
              backgroundColor: color,
            },
          ]}>
          <Text style={styles.labelText}>{label}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function PageCornersOverlay({
  pages,
  strokeWidth = 2.5,
  showLabels = true,
}: Props) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  const withCorners =
    pages?.filter((p): p is AiPageText & { corners: AiPageCorners } => p.corners != null) ??
    [];

  if (withCorners.length === 0) return null;

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== size.width || height !== size.height) {
      setSize({ width, height });
    }
  };

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={onLayout}>
      {size.width > 0 && size.height > 0
        ? withCorners.map((page, index) => (
            <QuadFrame
              key={`quad-${index}`}
              corners={page.corners}
              width={size.width}
              height={size.height}
              color={FRAME_COLORS[index % FRAME_COLORS.length]}
              thickness={strokeWidth}
              label={
                showLabels
                  ? page.pageNumber?.trim() || String(index + 1)
                  : undefined
              }
            />
          ))
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    position: 'absolute',
    minWidth: 18,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    alignItems: 'center',
  },
  labelText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
});
