/**
 * Globalny lock na odczyt-modyfikacja-zapis meta.json.
 * OCR i kolejka AI muszą iść przez ten sam łańcuch — inaczej równoległe
 * zapisy nadpisałyby sobie wyniki.
 */
let lock: Promise<unknown> = Promise.resolve();

export function withBookMetaLock<T>(task: () => Promise<T>): Promise<T> {
  const result = lock.then(task);
  lock = result.catch(() => undefined);
  return result;
}
