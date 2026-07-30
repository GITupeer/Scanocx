# llama.rn (natywne wsparcie — bez logiki modelu)

Pakiet [`llama.rn`](https://github.com/mybigday/llama.rn) jest w `package.json` i pluginie
`app.json` / `app-live.json`, żeby development/production build miał natywny runtime llama.cpp.

Aplikacja **nie pobiera ani nie uruchamia** lokalnego GGUF — logika Qwen została usunięta
(zbyt wolna / słaba jakość na telefonie). Korekta OCR idzie przez Gemini / API.

Gdy zechcesz wrócić do lokalnego LLM: dodaj warstwę JS (download + `initLlama` + prompt)
bez nowego native builda, o ile plugin `llama.rn` zostanie w konfiguracji.
