export type OcrStatus = 'pending' | 'done' | 'error';

/** Stan korekty Gemini: idle = jeszcze nie uruchomiona / unieważniona. */
export type AiStatus = 'idle' | 'pending' | 'done' | 'error';

export type BookPage = {
  id: string;
  index: number;
  imageUri: string;
  /** Surowy tekst z OCR (ML Kit) — nigdy nie nadpisywany przez AI. */
  ocrText: string;
  /** Tekst po korekcie Gemini; pusty, gdy AI jeszcze nie przetworzyło strony. */
  aiText: string;
  /** Numer wydrukowany na stronie książki (np. "12", "xiv"), jeśli wykryty. */
  printedPageNumber: string | null;
  ocrStatus: OcrStatus;
  aiStatus: AiStatus;
  /** Ostatni komunikat błędu Gemini; null gdy brak / sukces. */
  aiError: string | null;
  createdAt: string;
};

export type Book = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  pages: BookPage[];
};

export type BookSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  pageCount: number;
};
