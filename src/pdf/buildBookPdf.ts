import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';

import type { Book } from '@/src/domain/types';
import {
  escapeHtml,
  pageBody,
  sanitizeFilename,
  splitParagraphs,
} from '@/src/export/common';
import {
  analyzePageWords,
  pickBookPageFormat,
  type PageLayoutDensity,
} from '@/src/export/layout';
import { assertExportAllowed } from '@/src/export/quota';
import type { ExportFile } from '@/src/export/types';

function paragraphsHtml(text: string): string {
  const parts = splitParagraphs(text);
  if (parts.length === 0) return '';
  return parts
    .map((part, index) => {
      const cls = index === 0 ? ' class="first"' : '';
      return `<p${cls}>${escapeHtml(part)}</p>`;
    })
    .join('\n');
}

function densityClass(density: PageLayoutDensity): string {
  return `density-${density}`;
}

export async function buildBookPdfHtml(book: Book): Promise<{
  html: string;
  width: number;
  height: number;
}> {
  const analyses = book.pages.map((page) => {
    const text = pageBody(page);
    return { text, ...analyzePageWords(text) };
  });

  const format = pickBookPageFormat(analyses.map((a) => a.words));

  const pagesHtml = analyses
    .map((page, index) => {
      const body = paragraphsHtml(page.text);
      const isLast = index === analyses.length - 1;
      return `
      <section class="page ${densityClass(page.density)}${isLast ? ' last' : ''}">
        <div class="page-inner">
          ${body || '<p class="first empty">&nbsp;</p>'}
        </div>
      </section>`;
    })
    .join('\n');

  const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      @page {
        size: ${format.width}pt ${format.height}pt;
        margin: 0;
      }

      * { box-sizing: border-box; }

      html, body {
        margin: 0;
        padding: 0;
        color: #1a1a1a;
        /* Typografia książkowa — antykwa z szeryfem */
        font-family: "Palatino Linotype", Palatino, "Book Antiqua", Georgia, "Times New Roman", serif;
        font-weight: 400;
        -webkit-font-smoothing: antialiased;
      }

      .page {
        width: ${format.width}pt;
        height: ${format.height}pt;
        page-break-after: always;
        break-after: page;
        overflow: hidden;
      }
      .page.last {
        page-break-after: auto;
        break-after: auto;
      }

      .page-inner {
        height: 100%;
        text-align: justify;
        hyphens: auto;
        -webkit-hyphens: auto;
        word-break: break-word;
      }

      p {
        margin: 0 0 0.65em;
        text-indent: 1.35em;
      }
      p.first {
        text-indent: 0;
      }
      p.empty {
        text-indent: 0;
        color: transparent;
      }

      /* Mało tekstu — większa czcionka, szersze marginesy, wypełnia stronę */
      .density-airy .page-inner {
        padding: 14% 12%;
        font-size: 16.5pt;
        line-height: 1.7;
      }
      .density-airy p { margin-bottom: 0.9em; }

      .density-comfortable .page-inner {
        padding: 11% 10%;
        font-size: 13.5pt;
        line-height: 1.58;
      }

      /* Klasyczny układ książki */
      .density-book .page-inner {
        padding: 9% 9.5%;
        font-size: 11.25pt;
        line-height: 1.5;
      }

      .density-compact .page-inner {
        padding: 7.5% 8%;
        font-size: 10.25pt;
        line-height: 1.42;
      }

      .density-dense .page-inner {
        padding: 6.5% 7%;
        font-size: 9.5pt;
        line-height: 1.36;
      }
      .density-dense p { margin-bottom: 0.45em; }
    </style>
  </head>
  <body>
    ${pagesHtml}
  </body>
</html>`;

  return { html, width: format.width, height: format.height };
}

export async function buildBookPdfFile(book: Book): Promise<ExportFile> {
  if (book.pages.length === 0) {
    throw new Error('Książka nie ma jeszcze żadnych stron.');
  }
  assertExportAllowed('pdf');

  const { html, width, height } = await buildBookPdfHtml(book);
  const { uri: tempUri } = await Print.printToFileAsync({ html, width, height });

  const filename = `${sanitizeFilename(book.title)}.pdf`;
  const uri = `${FileSystem.cacheDirectory}${filename}`;
  await FileSystem.copyAsync({ from: tempUri, to: uri });

  return {
    uri,
    filename,
    mimeType: 'application/pdf',
    uti: 'com.adobe.pdf',
    format: 'pdf',
  };
}
