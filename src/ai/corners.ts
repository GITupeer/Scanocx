import type { AiCornerPoint, AiPageCorners, AiPageText } from '@/src/domain/types';

function clampUnit(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(Math.min(1, Math.max(0, n)) * 10000) / 10000;
}

function readXY(raw: unknown): { x: number; y: number } | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.x !== 'number' || typeof o.y !== 'number') return null;
  if (!Number.isFinite(o.x) || !Number.isFinite(o.y)) return null;
  return { x: o.x, y: o.y };
}

/**
 * Gemini często zwraca 0–100 (%), a nie 0–1.
 * Jeśli jakakolwiek współrzędna > 1 → traktuj jako procenty i dziel przez 100.
 */
function normalizePoints(
  points: Array<{ x: number; y: number }>
): AiCornerPoint[] {
  const max = Math.max(...points.flatMap((p) => [p.x, p.y]));
  const scale = max > 1.0001 ? 100 : 1;
  return points.map((p) => ({
    x: clampUnit(p.x / scale),
    y: clampUnit(p.y / scale),
  }));
}

/** Mapuje corners z API (snake_case) lub lokalne (camelCase) → 0–1. */
export function parseAiPageCorners(raw: unknown): AiPageCorners | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const rawPoints = [
    readXY(o.topLeft ?? o.top_left),
    readXY(o.topRight ?? o.top_right),
    readXY(o.bottomRight ?? o.bottom_right),
    readXY(o.bottomLeft ?? o.bottom_left),
  ];
  if (rawPoints.some((p) => p == null)) return null;
  const [topLeft, topRight, bottomRight, bottomLeft] = normalizePoints(
    rawPoints as Array<{ x: number; y: number }>
  );
  return { topLeft, topRight, bottomRight, bottomLeft };
}

/** Format do UI: procenty 0–100. */
export function formatCornerPercent(p: AiCornerPoint): string {
  return `${(p.x * 100).toFixed(1)}%, ${(p.y * 100).toFixed(1)}%`;
}

export function aiPageCornersToRemote(
  corners: AiPageCorners | null | undefined
): Record<string, { x: number; y: number }> | undefined {
  if (!corners) return undefined;
  return {
    top_left: corners.topLeft,
    top_right: corners.topRight,
    bottom_right: corners.bottomRight,
    bottom_left: corners.bottomLeft,
  };
}

export function pagesWithCorners(pages: AiPageText[] | undefined): AiPageText[] {
  if (!pages?.length) return [];
  return pages.filter((p) => p.corners != null);
}
