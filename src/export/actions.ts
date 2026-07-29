import type { Book } from '@/src/domain/types';
import { saveExportFileToDevice, shareExportFile } from '@/src/export/deliver';
import { buildBookEpubFile } from '@/src/export/epub';
import { commitExportUsage, type ExportFormat } from '@/src/export/quota';
import { buildBookTxtFile } from '@/src/export/txt';
import type { ExportDestination, ExportFile } from '@/src/export/types';
import { buildBookPdfFile } from '@/src/pdf/buildBookPdf';

export async function buildExportFile(book: Book, format: ExportFormat): Promise<ExportFile> {
  if (format === 'txt') return buildBookTxtFile(book);
  if (format === 'pdf') return buildBookPdfFile(book);
  return buildBookEpubFile(book);
}

export async function deliverExportFile(
  book: Book,
  file: ExportFile,
  destination: ExportDestination
): Promise<string> {
  let uri: string;
  if (destination === 'save') {
    uri = await saveExportFileToDevice(file);
  } else {
    await shareExportFile(file, `Udostępnij ${book.title}`);
    uri = file.uri;
  }
  await commitExportUsage(file.format);
  return uri;
}
