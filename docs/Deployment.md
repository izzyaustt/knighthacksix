# Deployment

The extension calls a hosted HTTPS backend; the backend calls Gemini, ElevenLabs and Tiger Data. Ollama is the local testing option. Users of a hosted build do not need Ollama or a local backend.

## Backend

Use Node 24. Keep `backend/` and `shared/` together. Install with `npm ci --prefix backend --omit=dev`, and start with `npm start --prefix backend`. Build the Docker image from the repository root with `docker build -f backend/Dockerfile -t langtube-api .`. The container uses Gemini by default. Image builds have not yet been verified here.

Set server-side environment variables in the hosting service:

- `NODE_ENV=production`, `HOST=0.0.0.0`, `PORT` as required by the host.
- `AI_PROVIDER=gemini`, `MOCK=0`, `GEMINI_API_KEY`, and a verified `GEMINI_MODEL` supported by your account.
- `ELEVENLABS_API_KEY`, optionally `ELEVENLABS_VOICE_ID`, and `ELEVENLABS_TTS_MODEL=eleven_flash_v2_5` for fast Spanish practice. See [ElevenLabs practice](ElevenLabs%20Practice.md) for setup and testing.
- `DATABASE_URL` and, if using the Tiger CA file, `PGSSLROOTCERT` pointing to a certificate mounted on the server. A developer's `/Users/...` path will not exist there. Keep certificate verification enabled.

Put credentials in server secrets, never in the extension or `VITE_*` variables. Keep the backend's `.cache` directory writable; its current caption cache is local to each server instance and may reset on redeployment. Check `/health` and `/health/database` after deployment.

## Extension

From `extension`, build with the actual deployed URLs:

```sh
VITE_BACKEND_URL=https://api.example.com VITE_DASHBOARD_URL=https://app.example.com npm run build
```

Replace both example URLs. The backend URL must be an HTTPS origin without a path. The build adds permission for that exact backend origin and overrides old stored localhost settings. Reload the extension and refresh YouTube. Default builds still use localhost for development.

Distribute `extension/dist` for unpacked demo testing, or package it for Chrome Web Store distribution. Publishing to the store is a separate step. Host `dashboard/dist` on Vercel and the backend on Render. Its build needs the repository root available because it imports `shared/`. See [Vercel setup](Vercel.md) and [Render backend setup](Render.md).

## Before a public launch

User data routes require Google sign-in and only ever act on the signed-in user (see `backend/README.md`). Before going public, set a strong `SESSION_SECRET`, add the production dashboard origin to the web OAuth client, and add the hosted backend to the extension's host permissions. `/align`, `/explain` and `/tts` are still unauthenticated and unlimited: add sign-in and rate limits to them so nobody can spend the AI/audio credits. CORS or Chrome host permissions are not authentication. Decide the hosting provider and production domains before deploying.

## Word lookup latency

A new lookup requests only a contextual translation and short definition. More detail requests grammar, an example and tone separately. New caption requests wait while the popup is open, although a caption request already in progress can still delay a lookup. Ollama can queue that behind caption-generation requests and may retry an invalid response once. Exact repeated lookups are cached within the backend process. Gemini uses the same route without requiring local model inference; measure its latency with the demo video before the demo. Cache persistence and a faster dictionary lookup path are possible follow-up improvements.
