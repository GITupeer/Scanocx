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

- Queue: `ai`
- Max 3 równoległe workery (`config/horizon.php` → `supervisor-ai`)
- Limit free: 3 strony/dzień (Europe/Warsaw)
- Limit pro: 500 stron/miesiąc

## Endpointy

- `POST /api/register|login|logout|forgot-password|reset-password`
- `GET /api/me`
- `GET /api/ai/quota`
- `POST /api/ai/analyze`
- `GET /api/ai/batches/{id}`
- `GET|PATCH /api/admin/users` (rola `admin`)
