import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { getDisplayText } from '@/src/ai/displayText';
import type { Book } from '@/src/domain/types';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export async function buildBookPdfHtml(book: Book): Promise<string> {
  const pagesHtml = book.pages.map((page) => {
    const text = getDisplayText(page).trim() || '(brak rozpoznanego tekstu)';
    const printed = page.printedPageNumber
      ? ` <span class="printed">(nr ${escapeHtml(page.printedPageNumber)})</span>`
      : '';
    const source =
      page.aiStatus === 'done' && page.aiText.trim()
        ? ' <span class="printed">· AI</span>'
        : ' <span class="printed">· OCR</span>';

    return `
      <section class="page">
        <h2>Strona ${page.index}${printed}${source}</h2>
        <pre>${escapeHtml(text)}</pre>
      </section>
    `;
  });

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body {
            font-family: Georgia, "Times New Roman", serif;
            color: #122024;
            margin: 0;
            padding: 24px;
          }
          h1 {
            font-size: 28px;
            margin: 0 0 8px;
          }
          .meta {
            color: #4a6066;
            margin-bottom: 32px;
            font-size: 13px;
          }
          .page {
            page-break-after: always;
            margin-bottom: 28px;
          }
          .page:last-child {
            page-break-after: auto;
          }
          h2 {
            font-size: 18px;
            margin: 0 0 12px;
          }
          h2 .printed {
            font-weight: 400;
            color: #4a6066;
            font-size: 14px;
          }
          pre {
            white-space: pre-wrap;
            word-wrap: break-word;
            font-family: Georgia, "Times New Roman", serif;
            font-size: 13px;
            line-height: 1.5;
            margin: 0;
          }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(book.title)}</h1>
        <p class="meta">Scanocx · ${book.pages.length} stron · tekst AI (lub OCR, gdy AI jeszcze nie gotowe)</p>
        ${pagesHtml.join('\n')}
      </body>
    </html>
  `;
}

export async function generateAndShareBookPdf(book: Book): Promise<string> {
  if (book.pages.length === 0) {
    throw new Error('Książka nie ma jeszcze żadnych stron.');
  }

  const html = await buildBookPdfHtml(book);
  const { uri } = await Print.printToFileAsync({ html });

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: `Udostępnij ${book.title}`,
      UTI: 'com.adobe.pdf',
    });
  }

  return uri;
}
