import type { UpsertBookPageInput } from '@/src/api/endpoints';
import * as api from '@/src/api/endpoints';
import { getAuthToken } from '@/src/api/token';
import { aiPageCornersToRemote } from '@/src/ai/corners';
import type { AiAnalysis, Book, BookPage } from '@/src/domain/types';

function aiMetaToRemote(analysis: AiAnalysis | null): Record<string, unknown> | null {
  if (!analysis) return null;
  return {
    title: analysis.title,
    subtitle: analysis.subtitle,
    ocr_quality: analysis.ocrQuality,
    coherence: analysis.coherence,
    page_number: analysis.pageNumber,
    prompt_tokens: analysis.promptTokens,
    output_tokens: analysis.outputTokens,
    total_tokens: analysis.totalTokens,
    ...(analysis.pages && analysis.pages.length > 0
      ? {
          pages: analysis.pages.map((p) => ({
            text: p.text,
            title: p.title,
            subtitle: p.subtitle,
            page_number: p.pageNumber,
            ocr_quality: p.ocrQuality,
            coherence: p.coherence,
            ...(aiPageCornersToRemote(p.corners)
              ? { corners: aiPageCornersToRemote(p.corners) }
              : {}),
          })),
        }
      : {}),
  };
}

export function pageToRemotePayload(page: BookPage): UpsertBookPageInput {
  return {
    local_id: page.id,
    index: page.index,
    ocr_text: page.ocrText || '',
    printed_page_number: page.printedPageNumber,
    ai_text: page.aiText || null,
    ai_status: page.aiStatus,
    ai_meta: aiMetaToRemote(page.aiAnalysis),
  };
}

export async function hasAuthToken(): Promise<boolean> {
  const token = await getAuthToken();
  return Boolean(token);
}

export async function pushBookToRemote(book: Book): Promise<void> {
  if (!(await hasAuthToken())) return;
  await api.upsertBook({
    local_id: book.id,
    title: book.title,
    pages: book.pages.map(pageToRemotePayload),
  });
}

export async function pushBookMetaToRemote(
  bookId: string,
  title: string
): Promise<void> {
  if (!(await hasAuthToken())) return;
  await api.upsertBook({ local_id: bookId, title });
}

export async function pushPageToRemote(
  bookId: string,
  page: BookPage
): Promise<void> {
  if (!(await hasAuthToken())) return;
  await api.upsertPage(bookId, pageToRemotePayload(page));
}

export async function pushPageOcrToRemote(
  bookId: string,
  page: BookPage
): Promise<void> {
  if (!(await hasAuthToken())) return;
  await api.updatePageRemote(bookId, page.id, {
    index: page.index,
    ocr_text: page.ocrText || '',
    printed_page_number: page.printedPageNumber,
    ai_text: page.aiText || null,
    ai_status: page.aiStatus,
    ai_meta: aiMetaToRemote(page.aiAnalysis),
  });
}

export async function deleteBookFromRemote(bookId: string): Promise<void> {
  if (!(await hasAuthToken())) return;
  await api.deleteBookRemote(bookId);
}

export async function deletePageFromRemote(
  bookId: string,
  pageId: string
): Promise<void> {
  if (!(await hasAuthToken())) return;
  await api.deletePageRemote(bookId, pageId);
}
