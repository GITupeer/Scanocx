import * as FileSystem from 'expo-file-system/legacy';

import type { Book } from '@/src/domain/types';
import { assertBookHasPages, buildBookPlainText, sanitizeFilename } from '@/src/export/common';
import { assertExportAllowed } from '@/src/export/quota';
import type { ExportFile } from '@/src/export/types';

export async function buildBookTxtFile(book: Book): Promise<ExportFile> {
  assertBookHasPages(book);
  assertExportAllowed('txt');

  const content = buildBookPlainText(book);
  const filename = `${sanitizeFilename(book.title)}.txt`;
  const uri = `${FileSystem.cacheDirectory}${filename}`;

  await FileSystem.writeAsStringAsync(uri, content, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  return {
    uri,
    filename,
    mimeType: 'text/plain',
    uti: 'public.plain-text',
    format: 'txt',
  };
}
