# Scanocx API

Laravel API dla auth, limitu AI i kolejki korekty Gemini.

## Wymagania

- PHP 8.2+
- Composer
- PostgreSQL (lub MySQL)
- Redis (kolejki Horizon)

## Setup lokalny

```bash
cd api
cp .env.example .env
composer install --ignore-platform-req=ext-pcntl --ignore-platform-req=ext-posix
php artisan key:generate
# uzupełnij DB_*, REDIS_*, GEMINI_API_KEY
php artisan migrate --seed
php artisan horizon
php artisan serve
```

Horizon na Windows wymaga `--ignore-platform-req` przy instalacji (brak `pcntl`). Na Laravel Cloud (Linux) działa normalnie.

## Kolejka AI

Na **Laravel Cloud** używamy **Managed queue**:

1. Queue name: `ai`
2. Max workers: `3`
3. Env: **`QUEUE_CONNECTION=cloud`** (ważne — nie `redis` / `database`)
4. Visibility timeout ≥ 180s

Jeśli joby w tabeli `ai_jobs` zostają na `queued`, aplikacja dispatchuje na zły driver (np. `database`/`redis`), a managed workers ich nie widzą.

## Endpointy

- `POST /api/register|login|logout|forgot-password|reset-password`
- `GET /api/me`
- `GET /api/ai/quota`
- `POST /api/ai/analyze`
- `GET /api/ai/batches/{id}`
- `GET /api/ocr/quota`
- `POST /api/ocr/reserve|consume|release` (tylko licznik — bez tekstu stron)
- `GET|PATCH /api/admin/users` (rola `admin`)
