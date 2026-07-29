import { Buffer } from 'buffer';
import * as FileSystem from 'expo-file-system/legacy';

import type { Book } from '@/src/domain/types';
import {
  assertBookHasPages,
  escapeXml,
  pageBody,
  pageExcerpt,
  sanitizeFilename,
  splitParagraphs,
} from '@/src/export/common';
import { assertExportAllowed } from '@/src/export/quota';
import type { ExportFile } from '@/src/export/types';
import { createZipStore, type ZipEntry } from '@/src/export/zip';

function utf8(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, 'utf8'));
}

function paragraphsXhtml(text: string): string {
  const parts = splitParagraphs(text);
  if (parts.length === 0) return '<p class="first">&nbsp;</p>';
  return parts
    .map((part, index) => {
      const cls = index === 0 ? ' class="first"' : '';
      return `<p${cls}>${escapeXml(part)}</p>`;
    })
    .join('\n');
}

function buildContainerXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
}

function buildContentOpf(book: Book): string {
  const manifestPages = book.pages
    .map(
      (page) =>
        `    <item id="page-${page.index}" href="page-${page.index}.xhtml" media-type="application/xhtml+xml"/>`
    )
    .join('\n');
  const spinePages = book.pages
    .map((page) => `    <itemref idref="page-${page.index}"/>`)
    .join('\n');
  const modified = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const bookId = `scanocx-${book.id}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="BookId">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="BookId">${escapeXml(bookId)}</dc:identifier>
    <dc:title>${escapeXml(book.title)}</dc:title>
    <dc:language>pl</dc:language>
    <dc:creator>Scanocx</dc:creator>
    <meta property="dcterms:modified">${modified}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="title" href="title.xhtml" media-type="application/xhtml+xml"/>
    <item id="css" href="book.css" media-type="text/css"/>
${manifestPages}
  </manifest>
  <spine>
    <itemref idref="title"/>
${spinePages}
  </spine>
</package>`;
}

function buildBookCss(): string {
  return `body {
  font-family: "Palatino Linotype", Palatino, "Book Antiqua", Georgia, "Times New Roman", serif;
  color: #1a1a1a;
  line-height: 1.55;
  margin: 1.2em 1.1em;
  text-align: justify;
  -webkit-hyphens: auto;
  hyphens: auto;
}
h1.title {
  font-family: "Palatino Linotype", Palatino, Georgia, serif;
  font-size: 1.7em;
  font-weight: 700;
  text-align: center;
  margin: 2.5em 0 0.4em;
  line-height: 1.25;
  text-indent: 0;
}
p {
  margin: 0 0 0.7em;
  text-indent: 1.3em;
  font-size: 1em;
}
p.first {
  text-indent: 0;
}
nav ol {
  padding-left: 1.2em;
}
nav a {
  color: #1a1a1a;
  text-decoration: none;
}`;
}

function buildNavXhtml(book: Book): string {
  const items = book.pages
    .map(
      (page) =>
        `        <li><a href="page-${page.index}.xhtml">${escapeXml(pageExcerpt(page))}</a></li>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="pl">
  <head>
    <meta charset="utf-8"/>
    <title>${escapeXml(book.title)}</title>
    <link rel="stylesheet" type="text/css" href="book.css"/>
  </head>
  <body>
    <nav epub:type="toc">
      <ol>
        <li><a href="title.xhtml">${escapeXml(book.title)}</a></li>
${items}
      </ol>
    </nav>
  </body>
</html>`;
}

function buildTitleXhtml(book: Book): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="pl">
  <head>
    <meta charset="utf-8"/>
    <title>${escapeXml(book.title)}</title>
    <link rel="stylesheet" type="text/css" href="book.css"/>
  </head>
  <body>
    <h1 class="title">${escapeXml(book.title)}</h1>
  </body>
</html>`;
}

function buildPageXhtml(book: Book, pageIndex: number): string {
  const page = book.pages[pageIndex]!;
  const text = pageBody(page);
  const body = paragraphsXhtml(text);
  const title = pageExcerpt(page, 48);

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="pl">
  <head>
    <meta charset="utf-8"/>
    <title>${escapeXml(title)}</title>
    <link rel="stylesheet" type="text/css" href="book.css"/>
  </head>
  <body>
    ${body}
  </body>
</html>`;
}

export async function buildBookEpubBytes(book: Book): Promise<Buffer> {
  assertBookHasPages(book);

  const entries: ZipEntry[] = [
    { name: 'mimetype', data: utf8('application/epub+zip') },
    { name: 'META-INF/container.xml', data: utf8(buildContainerXml()) },
    { name: 'OEBPS/book.css', data: utf8(buildBookCss()) },
    { name: 'OEBPS/content.opf', data: utf8(buildContentOpf(book)) },
    { name: 'OEBPS/nav.xhtml', data: utf8(buildNavXhtml(book)) },
    { name: 'OEBPS/title.xhtml', data: utf8(buildTitleXhtml(book)) },
  ];

  for (let i = 0; i < book.pages.length; i += 1) {
    const page = book.pages[i]!;
    entries.push({
      name: `OEBPS/page-${page.index}.xhtml`,
      data: utf8(buildPageXhtml(book, i)),
    });
  }

  return createZipStore(entries);
}

export async function buildBookEpubFile(book: Book): Promise<ExportFile> {
  assertBookHasPages(book);
  assertExportAllowed('epub');

  const bytes = await buildBookEpubBytes(book);
  const filename = `${sanitizeFilename(book.title)}.epub`;
  const uri = `${FileSystem.cacheDirectory}${filename}`;

  await FileSystem.writeAsStringAsync(uri, bytes.toString('base64'), {
    encoding: FileSystem.EncodingType.Base64,
  });

  return {
    uri,
    filename,
    mimeType: 'application/epub+zip',
    uti: 'org.idpf.epub-container',
    format: 'epub',
  };
}
