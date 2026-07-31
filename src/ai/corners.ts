import type {
  AiCornerPoint,
  AiPageBounds,
  AiPageCorners,
  AiPageText,
} from '@/src/domain/types';

function clampUnit(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(Math.min(1, Math.max(0, n)) * 10000) / 10000;
}

function clampPercent(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(Math.min(100, Math.max(0, n)) * 100) / 100;
}

function asNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) {
    return Number(v);
  }
  return null;
}

function readXY(raw: unknown): { x: number; y: number } | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const x = asNumber(o.x);
  const y = asNumber(o.y);
  if (x == null || y == null) return null;
  return { x, y };
}

function boundsToCorners01(b: AiPageBounds): AiPageCorners {
  const l = clampUnit(b.left / 100);
  const t = clampUnit(b.top / 100);
  const r = clampUnit(b.right / 100);
  const btm = clampUnit(b.bottom / 100);
  return {
    topLeft: { x: l, y: t },
    topRight: { x: r, y: t },
    bottomRight: { x: r, y: btm },
    bottomLeft: { x: l, y: btm },
  };
}

function cornersToBoundsPercent(c: AiPageCorners): AiPageBounds {
  const xs = [c.topLeft.x, c.topRight.x, c.bottomRight.x, c.bottomLeft.x];
  const ys = [c.topLeft.y, c.topRight.y, c.bottomRight.y, c.bottomLeft.y];
  return {
    left: clampPercent(Math.min(...xs) * 100),
    top: clampPercent(Math.min(...ys) * 100),
    right: clampPercent(Math.max(...xs) * 100),
    bottom: clampPercent(Math.max(...ys) * 100),
  };
}

/** Parsuje bounds % (0–100 lub 0–1). */
export function parseAiPageBounds(raw: unknown): AiPageBounds | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const left = asNumber(o.left);
  const top = asNumber(o.top);
  const right = asNumber(o.right);
  const bottom = asNumber(o.bottom);
  if (left == null || top == null || right == null || bottom == null) return null;

  let l = left;
  let t = top;
  let r = right;
  let b = bottom;
  const max = Math.max(l, t, r, b);
  if (max <= 1.0001) {
    l *= 100;
    t *= 100;
    r *= 100;
    b *= 100;
  }
  l = clampPercent(l);
  t = clampPercent(t);
  r = clampPercent(r);
  b = clampPercent(b);
  if (r - l < 3 || b - t < 3) return null;
  return { left: l, top: t, right: r, bottom: b };
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
  const xs = [topLeft.x, topRight.x, bottomRight.x, bottomLeft.x];
  const ys = [topLeft.y, topRight.y, bottomRight.y, bottomLeft.y];
  if (Math.max(...xs) - Math.min(...xs) < 0.03) return null;
  if (Math.max(...ys) - Math.min(...ys) < 0.03) return null;
  return { topLeft, topRight, bottomRight, bottomLeft };
}

/** Preferuj bounds → corners; fallback do corners. */
export function resolvePageGeometry(raw: {
  bounds?: unknown;
  corners?: unknown;
}): { bounds: AiPageBounds; corners: AiPageCorners } | null {
  const bounds = parseAiPageBounds(raw.bounds);
  if (bounds) {
    return { bounds, corners: boundsToCorners01(bounds) };
  }
  const corners = parseAiPageCorners(raw.corners);
  if (corners) {
    return { bounds: cornersToBoundsPercent(corners), corners };
  }
  return null;
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

export function aiPageBoundsToRemote(
  bounds: AiPageBounds | null | undefined
): Record<string, number> | undefined {
  if (!bounds) return undefined;
  return {
    left: bounds.left,
    top: bounds.top,
    right: bounds.right,
    bottom: bounds.bottom,
  };
}

/** Format do UI: procenty 0–100. */
export function formatCornerPercent(p: AiCornerPoint): string {
  return `${(p.x * 100).toFixed(1)}%, ${(p.y * 100).toFixed(1)}%`;
}

export function formatBoundsPercent(b: AiPageBounds): string {
  return `L ${b.left.toFixed(1)}% · T ${b.top.toFixed(1)}% · R ${b.right.toFixed(1)}% · B ${b.bottom.toFixed(1)}%`;
}

export function pagesWithCorners(pages: AiPageText[] | undefined): AiPageText[] {
  if (!pages?.length) return [];
  return pages.filter((p) => p.corners != null);
}
