# Scanocx

**AI Smart Scan Your Books** — lokalna aplikacja Expo (Android) do skanowania stron książki, OCR na urządzeniu (ML Kit) i eksportu PDF.

## Wymagania

- Node.js 20+
- Konto Expo / EAS (`npm i -g eas-cli`, potem `eas login`)
- Telefon Android z Google Play Services
- **Development build** — aplikacja **nie działa w Expo Go** (natywny moduł `expo-mlkit-ocr`)

## Szybki start

```bash
npm install
eas init
```

Po `eas init` uzupełnij w `app.json`:

- `expo.extra.eas.projectId`
- `expo.updates.url` (`https://u.expo.dev/<projectId>`)

### 1. Zbuduj Dev Client (Android APK)

```bash
eas build -p android --profile development
```

Zainstaluj APK z linku EAS na telefonie.

### 2. Uruchom Metro

```bash
npm start
```

Otwórz aplikację Dev Client na telefonie i połącz z bundlerem (QR / ten sam Wi‑Fi).

### Profile EAS

| Profile | Opis |
|---------|------|
| `development` | Dev Client + channel `development`, APK |
| `preview` | Wewnętrzny build + channel `preview`, APK |
| `production` | AAB + channel `production` |

### EAS Update (OTA JS)

Po zmianach w JS/TS (bez nowych natywnych zależności):

```bash
eas update --channel development --message "opis zmian"
# lub
eas update --channel preview --message "opis zmian"
```

`runtimeVersion` = `appVersion` — update trafia tylko do buildów z tą samą wersją aplikacji.

## Funkcje MVP

1. Biblioteka lokalnych książek
2. Szybkie zdjęcia stron (kamera / galeria)
3. OCR ML Kit on-device + wykrywanie numerów stron (usuwane z tekstu OCR)
4. Korekta AI w chmurze (Laravel + kolejka Horizon, max 3 joby) — wymaga logowania
5. Limity: free 5 stron AI/miesiąc, pro 500/miesiąc (pro przypisywane ręcznie przez admina)
6. Edycja rozpoznanego tekstu
7. PDF i udostępnianie

Dane lokalne: `books/{id}/meta.json` + `pages/*.jpg`. Przy analizie AI do chmury idzie tylko OCR (bez zdjęć).

## Backend (`api/`)

Zobacz [api/README.md](api/README.md).

Env aplikacji:

```bash
# .env.local
EXPO_PUBLIC_API_BASE_URL=https://twoje-api.laravel.cloud
```

## Struktura

```
app/                 # ekrany Expo Router (+ auth, admin/users)
api/                 # Laravel API (Sanctum, Spatie, Horizon, Gemini)
src/ai/              # orchestracja AI → API + polling
src/api/             # klient HTTP
src/auth/            # AuthProvider + SecureStore
src/domain/          # typy Book / Page
src/storage/         # lokalny CRUD (FileSystem)
src/ocr/             # wrapper ML Kit
src/pdf/             # HTML → PDF (expo-print)
src/ui/              # UI
```

## Uwagi

- Platforma na ten moment: **tylko Android**
- OCR i zdjęcia zostają lokalnie; AI wymaga konta i sieci
- Po dodaniu lub aktualizacji natywnych modułów zbuduj nowy Dev Client

Natywne pakiety w Dev Client (wymagają rebuildu): `expo-secure-store`, `expo-notifications`, `expo-device`, `expo-haptics`, `expo-clipboard`, `expo-local-authentication`, `expo-network`, `@react-native-community/netinfo`.

```bash
eas build -p android --profile development
```
