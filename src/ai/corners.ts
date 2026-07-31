import type { AiCornerPoint, AiPageCorners, AiPageText } from '@/src/domain/types';

function clampUnit(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(Math.min(1, Math.max(0, n)) * 10000) / 10000;
}

function parsePoint(raw: unknown): AiCornerPoint | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.x !== 'number' || typeof o.y !== 'number') return null;
  return { x: clampUnit(o.x), y: clampUnit(o.y) };
}

/** Mapuje corners z API (snake_case) lub lokalne (camelCase). */
export function parseAiPageCorners(raw: unknown): AiPageCorners | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const topLeft = parsePoint(o.topLeft ?? o.top_left);
  const topRight = parsePoint(o.topRight ?? o.top_right);
  const bottomRight = parsePoint(o.bottomRight ?? o.bottom_right);
  const bottomLeft = parsePoint(o.bottomLeft ?? o.bottom_left);
  if (!topLeft || !topRight || !bottomRight || !bottomLeft) return null;
  return { topLeft, topRight, bottomRight, bottomLeft };
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
