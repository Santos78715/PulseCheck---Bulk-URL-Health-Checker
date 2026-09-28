# PulseCheck web app

The Next.js app provides a dashboard for creating URL-check batches, reviewing recent batch progress, and inspecting or managing individual URL checks.

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Start the Nest API at `http://localhost:3000` as well. The Next server runs at `http://localhost:3001` and proxies `/api/*` requests (including SSE and multipart CSV uploads) to `API_ORIGIN`, which defaults to `http://localhost:3000`.

Open `http://localhost:3001` for the frontend. Set `API_ORIGIN` in `.env.local` if the Nest API uses a different port or host.

## Features

- Create a batch from pasted HTTP or HTTPS URLs or upload a CSV file.
- Search and review the 50 most recent batches.
- View individual URL results, filter by status, cancel active batches, and retry failed checks.
- Receive batch events over SSE, with periodic polling as a fallback.
