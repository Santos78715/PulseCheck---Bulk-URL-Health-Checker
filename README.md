# PulseCheck — Bulk URL Health Monitor

PulseCheck checks large sets of websites in the background and gives you a live view of availability, HTTP status, response time, retries, and failures. The project includes a NestJS API and BullMQ worker, PostgreSQL persistence, Redis-backed queues and events, and a Next.js dashboard.

## What it does

- Create URL-check batches with JSON or CSV uploads (up to 1,000 URLs per batch).
- Run checks asynchronously, with bounded concurrency and rate limiting.
- See per-URL progress and results in the web dashboard.
- Cancel active batches and retry failed URLs.
- Receive live updates over server-sent events, with the frontend polling as a fallback.

## Architecture

```text
Next.js web app ── proxy /api/* ──> NestJS API ──> PostgreSQL
       ▲                              │
       │ SSE                          ├── BullMQ queue ──> Redis
       │                              │                       │
       └──────── Redis Pub/Sub <───────┴──── URL-check worker
```

### Backend concepts

- **PostgreSQL and Prisma:** `Batch` and `UrlCheck` records are the source of truth. Batch progress and terminal URL transitions are updated transactionally.
- **BullMQ and a separate worker:** the API persists a batch and enqueues URL checks. `api/src/worker.ts` starts a worker process separately from the HTTP API. Jobs use exponential retry backoff, while global limits cap work at five concurrent checks and ten jobs per second.
- **Race-safe URL state transitions:** the worker claims queued URLs with a conditional `updateMany`, and completion only updates URLs still queued or running. This prevents duplicate jobs or late cancellation messages from counting the same URL more than once.
- **Cancellation and retry:** queued URLs are cancelled in the database; Redis Pub/Sub tells the worker to abort active HTTP requests. Failed URLs can be reset and enqueued again.
- **Redis Pub/Sub and SSE:** the worker publishes batch and URL events to Redis. The API subscribes and exposes `GET /batches/:id/events` as an SSE stream, allowing multiple API and worker processes to exchange updates.
- **Batch-list cache:** `GET /batches` caches the latest 50 batches in Redis for 30 seconds. State transitions invalidate it. A version check prevents a stale in-flight database read from restoring an invalidated cache entry.
- **Next.js API proxy:** the browser calls the frontend’s `/api/*` routes. Next.js proxies those requests, including multipart CSV uploads and SSE, to `API_ORIGIN`, avoiding a separate browser CORS configuration.

## Requirements

- Node.js 20 or newer
- npm
- Docker Compose (for local PostgreSQL and Redis)

## Run locally

Start the backing services from the repository root:

```bash
docker compose up -d
```

Configure and start the API:

```bash
cd api
npm install
cp .env.example .env
npx prisma generate
npx prisma migrate deploy
npm run start:dev
```

In a second terminal, start the URL-check worker:

```bash
cd api
npm run worker
```

In a third terminal, start the frontend:

```bash
cd web
npm install
cp .env.example .env.local
npm run dev
```

Open <http://localhost:3001>. The API listens on <http://localhost:3000>. Adjust `DATABASE_URL`, `REDIS_URL`, or `API_ORIGIN` in the local environment files when your services use different addresses. Never commit real environment files or credentials.

## API routes

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/batches` | Create a batch from `{ "urls": ["https://example.com"] }` |
| `POST` | `/batches/csv` | Create a batch from multipart CSV using the `file` field |
| `GET` | `/batches` | List the 50 newest batches |
| `GET` | `/batches/:id` | Get a batch and its URL checks |
| `POST` | `/batches/:id/cancel` | Cancel queued and in-flight checks |
| `POST` | `/batches/:id/retry` | Requeue failed checks |
| `GET` | `/batches/:id/events` | Subscribe to batch updates over SSE |

CSV files may include a `url` header and must contain between 1 and 1,000 HTTP or HTTPS URLs. The upload size limit is 2 MB.

## Checks

```bash
cd api && npm test && npm run lint
cd web && npm run lint && npm run build
```

The API also has an e2e test command, `npm run test:e2e`. It uses the configured test environment and may require PostgreSQL and Redis.
