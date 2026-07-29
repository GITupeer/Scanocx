/** idle = zdjęcie bez OCR (limit / celowo); pending = w toku; done / error = wynik. */
export type OcrStatus = 'idle' | 'pending' | 'done' | 'error';

/** Stan korekty Gemini: idle = jeszcze nie uruchomiona / unieważniona. */
export type AiStatus = 'idle' | 'pending' | 'done' | 'error';

/** Metryki jakości OCR zapisane przy odczycie. */
export type OcrConfidenceQuality = {
  available: boolean;
  elementCount: number;
  average: number | null;
  lowRatio: number | null;
  weak: boolean;
};

export type OcrQuality = {
  confidence: OcrConfidenceQuality;
};

/** Metadane z korekty Gemini (tytuł, jakość, numer strony). */
export type AiAnalysis = {
  /** Wykryty tytuł / nagłówek; null gdy brak. */
  title: string | null;
  /** Wykryty podtytuł; null gdy brak. */
  subtitle: string | null;
  /** Ocena jakości OCR przed korektą, 0.00–1.00. */
  ocrQuality: number;
  /** Spójność tekstu po korekcie AI, 0.00–1.00. */
  coherence: number;
  /** Numer strony wykryty przez AI (usunięty z tekstu); null gdy brak. */
  pageNumber: string | null;
};

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
  /** Jakość układu i pewności z ostatniego OCR; null gdy brak odczytu. */
  ocrQuality: OcrQuality | null;
  /** Analiza z ostatniej udanej korekty AI; null gdy brak. */
  aiAnalysis: AiAnalysis | null;
  ocrStatus: OcrStatus;
  aiStatus: AiStatus;
  /** Ostatni komunikat błędu Gemini; null gdy brak / sukces. */
  aiError: string | null;
  createdAt: string;
};

export type Book = {
  id: string;
  title: string;
  /** Lokalna ścieżka JPEG okładki; null gdy brak własnego zdjęcia. */
  coverUri: string | null;
  createdAt: string;
  updatedAt: string;
  pages: BookPage[];
};

export type BookSummary = {
  id: string;
  title: string;
  coverUri: string | null;
  createdAt: string;
  updatedAt: string;
  pageCount: number;
};
