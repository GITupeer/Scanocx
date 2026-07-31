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

/** Punkt znormalizowany 0–1 względem obrazu (lewy górny = 0,0). */
export type AiCornerPoint = {
  x: number;
  y: number;
};

/** Czworokąt papieru strony wykryty przez AI (0–1). */
export type AiPageCorners = {
  topLeft: AiCornerPoint;
  topRight: AiCornerPoint;
  bottomRight: AiCornerPoint;
  bottomLeft: AiCornerPoint;
};

/** Prostokąt papieru w procentach 0–100 całego zdjęcia. */
export type AiPageBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

/** Jedna strona książki wykryta na zdjęciu przez AI (rozkładówka = wiele). */
export type AiPageText = {
  text: string;
  title: string | null;
  subtitle: string | null;
  pageNumber: string | null;
  ocrQuality: number;
  coherence: number;
  /** Rogi papieru na zdjęciu (0–1); brak gdy starszy wynik AI. */
  corners?: AiPageCorners | null;
  /** Bbox w % 0–100 — źródło z Gemini. */
  bounds?: AiPageBounds | null;
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
  /** Tokeny wejściowe ostatniego requestu AI; null gdy brak danych. */
  promptTokens: number | null;
  /** Tokeny wyjściowe ostatniego requestu AI; null gdy brak danych. */
  outputTokens: number | null;
  /** Suma tokenów (wejście + wyjście + ewentualne thinking); null gdy brak. */
  totalTokens: number | null;
  /**
   * Poszczególne strony odczytane z jednego zdjęcia (kolejność lewa→prawa).
   * Brak / pusta = starsze rekordy; wtedy używaj `aiText`.
   */
  pages?: AiPageText[];
};

export type BookPage = {
  id: string;
  index: number;
  /** Lokalny JPEG przycięty / poprawiony; null gdy strona istnieje tylko na backendzie. */
  imageUri: string | null;
  /** Surowy JPEG bez kadru (pełna klatka); null gdy brak osobnego oryginału. */
  originalImageUri: string | null;
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
  /**
   * Skan rozkładówki / wielu stron — bez OCR ML Kit; odczyt tylko przez AI.
   * Opcjonalne dla starszych stron w meta.json.
   */
  aiOnly?: boolean;
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
