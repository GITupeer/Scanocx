import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import type { ExportFile } from '@/src/export/types';

export class ExportCancelledError extends Error {
  constructor() {
    super('Anulowano zapis na urządzenie.');
    this.name = 'ExportCancelledError';
  }
}

export async function shareExportFile(file: ExportFile, dialogTitle: string): Promise<void> {
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error('Udostępnianie jest niedostępne na tym urządzeniu.');
  }

  await Sharing.shareAsync(file.uri, {
    mimeType: file.mimeType,
    dialogTitle,
    UTI: file.uti,
  });
}

/**
 * Zapis na urządzenie:
 * - Android: wybór folderu (SAF) i zapis pliku
 * - iOS: arkusz systemowy → „Zapisz w Plikach”
 */
export async function saveExportFileToDevice(file: ExportFile): Promise<string> {
  if (Platform.OS === 'android') {
    const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!permissions.granted) {
      throw new ExportCancelledError();
    }

    const destUri = await FileSystem.StorageAccessFramework.createFileAsync(
      permissions.directoryUri,
      file.filename,
      file.mimeType
    );

    const base64 = await FileSystem.readAsStringAsync(file.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    await FileSystem.writeAsStringAsync(destUri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    return destUri;
  }

  await shareExportFile(file, `Zapisz ${file.filename}`);
  return file.uri;
}
