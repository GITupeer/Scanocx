import type { ExportFormat } from '@/src/export/quota';

export type ExportFile = {
  uri: string;
  filename: string;
  mimeType: string;
  uti: string;
  format: ExportFormat;
};

export type ExportDestination = 'save' | 'share';
