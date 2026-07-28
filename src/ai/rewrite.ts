import { runPageAiExclusive } from '@/src/ai/queue';
import { updatePageAi } from '@/src/storage/books';
import { withBookMetaLock } from '@/src/storage/lock';

export type AiRewriteProgress =
  | { phase: 'preparing'; detail: string }
  | { phase: 'saving'; detail: string }
  | { phase: 'sending' | 'waiting' | 'parsing'; detail: string };

/**
 * Korekta jednej strony przez backend (kolejka + polling).
 */
export async function rewritePageWithAi(
  bookId: string,
  pageId: string,
  onProgress?: (progress: AiRewriteProgress) => void
): Promise<string> {
  onProgress?.({
    phase: 'preparing',
    detail: 'Wysyłam stronę do kolejki AI…',
  });

  await withBookMetaLock(() =>
    updatePageAi(bookId, pageId, { aiStatus: 'pending', aiError: null })
  );

  try {
    const aiText = await runPageAiExclusive(bookId, pageId);
    onProgress?.({
      phase: 'saving',
      detail: 'Zapisano wynik AI…',
    });
    return aiText;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Korekta AI nie powiodła się.';
    await withBookMetaLock(() =>
      updatePageAi(bookId, pageId, { aiStatus: 'error', aiError: message })
    );
    throw error;
  }
}
