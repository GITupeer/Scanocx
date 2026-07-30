import * as FileSystem from 'expo-file-system/legacy';

export function booksRoot(): string {
  const root = FileSystem.documentDirectory;
  if (!root) {
    throw new Error('documentDirectory is unavailable on this platform.');
  }
  return `${root}books/`;
}

export function bookDir(bookId: string): string {
  return `${booksRoot()}${bookId}/`;
}

export function bookMetaPath(bookId: string): string {
  return `${bookDir(bookId)}meta.json`;
}

export function bookPagesDir(bookId: string): string {
  return `${bookDir(bookId)}pages/`;
}

export function bookCoverPath(bookId: string, stamp = Date.now()): string {
  return `${bookDir(bookId)}cover-${stamp}.jpg`;
}

export function pageImagePath(bookId: string, pageId: string, stamp?: number): string {
  if (stamp == null) {
    return `${bookPagesDir(bookId)}${pageId}.jpg`;
  }
  return `${bookPagesDir(bookId)}${pageId}-${stamp}.jpg`;
}

/** Pełna klatka bez kadru — osobny plik obok wersji przyciętej. */
export function pageOriginalImagePath(bookId: string, pageId: string, stamp?: number): string {
  if (stamp == null) {
    return `${bookPagesDir(bookId)}${pageId}-original.jpg`;
  }
  return `${bookPagesDir(bookId)}${pageId}-original-${stamp}.jpg`;
}
