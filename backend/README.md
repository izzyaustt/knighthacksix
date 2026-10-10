# Backend API and Tiger Data

Use Node.js 22.18 or newer (Node.js 24 is suitable). The server imports TypeScript provider modules directly, which the older Node.js 20 executable on this machine does not support.

From `knighthacksix/backend`:

```sh
npm ci
npm start
```

The server listens on `http://localhost:3000` by default, bound to the local computer. `PORT` overrides the port. Local demo routes have no authentication; keep this server local until access controls are implemented.

## Environment

Existing shell settings take priority. The server then loads `backend/.env`, followed by missing values from `knighthacksix/.env`.

- Database: `DATABASE_URL` or `TIGER_DATA_CONNECTION_STRING`.
- Speech: `ELEVENLABS_API_KEY` and optional `ELEVENLABS_VOICE_ID`.
- Alignment: `GEMINI_API_KEY` and optional `GEMINI_MODEL`.
- Local testing without Gemini quota: `LLM_PROVIDER=ollama` sends `/align` and `/explain` to a local [Ollama](https://ollama.com) model (`OLLAMA_MODEL`, default `gemma3:4b`; `OLLAMA_URL`, default `http://localhost:11434`). Install with `brew install ollama`, run `ollama serve`, then `ollama pull gemma3:4b`. Translation quality is lower than Gemini; leave `LLM_PROVIDER` unset in production. `GET /health` reports the active provider as `llm`.

Database connections use TLS with certificate verification. If the service needs a custom root certificate, configure `PGSSLROOTCERT` or the connection URL's `sslrootcert` path. Credentials stay server-side and database errors do not expose connection values.

On this machine, the service's private Timescale CA is pinned in the ignored `backend/.cache/tiger-ca.pem`, and the ignored project `.env` points to it. That local certificate/configuration is not included in Git; teammates need to obtain/trust the service CA themselves or use the service's publicly signed certificate when available. Keep certificate verification enabled.

Apply the existing schema before starting database-backed traffic; see [database setup](db/README.md).

## Database routes

| Route | Input | Result |
| --- | --- | --- |
| `GET /health/database` | None | Database connectivity status |
| `POST /events` | `user_id`, `event_type`, optional `event_id`, `lang`, `word`, `video_id`, `score`, `meta` | Persisted event ID/time and duplicate flag |
| `POST /vocab` | `user_id`, `word`, optional `lang`, `translation`, `video_id`, `video_ts` | Saved vocabulary; first save logs one event |
| `GET /vocab` | `user_id`, optional `lang`, `limit` | Saved words |
| `GET /stats/score-trend` | `user_id`, optional `lang`, `days` | Daily intelligibility averages and attempt counts |
| `GET /stats/activity` | Same | Daily attempts, lookups, saves, watched minutes |
| `GET /stats/recent` | `user_id`, optional `lang`, `limit`, `since` | Recent event snapshot with attempt feedback |
| `GET /stats/trouble-words` | `user_id`, optional `lang`, `limit` | Per-word misses and miss rates |
| `GET /stats/heatmap` | `user_id`, optional `lang`, `days` | 168 day/hour activity cells |

Use `demo-user` initially. Other user IDs must already exist in `users`. Language defaults to `es`. Statistics group days in `America/New_York`. Numeric counts are JSON numbers. Empty history returns empty points, rather than fake scores; heatmap cells are zero-filled.

`/events` accepts `lookup`, `save`, `review`, and `caption_view`. Supply a stable UUID `event_id` and the same payload when retrying; a transaction/advisory lock prevents duplicate writes across different retry timestamps. Changed data for an existing ID returns 409. Omitted IDs are generated, so clients cannot safely deduplicate a lost response without supplying their own ID.

For vocabulary, `/vocab` logs the first save. The extension must not also emit a `/events` save for that same action. `caption_view` metadata can contain a numeric `watched_seconds`, representing actual active playback duration.

## Persisted speaking attempts

`POST /stt` accepts multipart `audio` and `target_text`, plus optional `user_id`, `attempt_id`, `lang`, `video_id`, and `video_ts`. For backward compatibility, missing user/language use `demo-user`/`es`, and a missing attempt ID is generated.

Supply an `attempt_id` UUID once per recording and reuse it on retry. A completed retry returns the saved score without another speech-provider call. A currently processing attempt returns 409 with `ATTEMPT_PROCESSING` and `Retry-After`. Failed attempts can be claimed for retry; changed target/language/video context returns 409.

The backend saves the completed attempt and its learning event in one database transaction. Responses retain `transcript`, `score`, and `words`, and add `attempt_id`, `event_saved`, and `saved_at`. If scoring succeeds but saving fails, the response has `event_saved: false`; show the feedback with a "progress not saved" state and retain the ID for retry. A retry may call the speech provider again in this case.

Do not submit `shadow_attempt` to `/events`; `/stt` owns this write. Raw recording bytes are not stored. Treat attempt IDs as tied to the same recording: the current schema checks context, but does not store an audio fingerprint. A process crash can leave a processing claim; automatic stale-claim recovery is not implemented yet.

## Quick read-only checks

With the server running:

```sh
curl http://localhost:3000/health/database
curl 'http://localhost:3000/stats/recent?user_id=demo-user'
curl 'http://localhost:3000/stats/score-trend?user_id=demo-user&days=7'
curl 'http://localhost:3000/stats/activity?user_id=demo-user&days=7'
```

The dashboard should poll a bounded `/stats/recent` snapshot every two seconds and deduplicate by `event_id`. `since` is an ISO timestamp filter, not a lossless cursor; late commits or more events than the snapshot limit can be missed. Opaque cursors are not implemented and requests containing `cursor` return 400. Refetch statistics after new events. Clearly label synthetic rows/history when `is_synthetic`/`includes_synthetic` is true.

## Integration test

```sh
RUN_DB_TESTS=1 npm run test:db
npm run typecheck
```

The database test uses the real configured database and local HTTP routes, with mocked speech transcription. All fixture data lives in an outer transaction and is rolled back; it does not call paid AI/audio providers. It tests event/attempt retries, vocabulary, user filtering, live recent feedback, and statistics. Route transactions use savepoints during the test; this does not test concurrency across separate connections. Without `RUN_DB_TESTS=1`, the integration test is skipped.

## Extension integration

The extension service worker calls this local server; keys remain in the backend environment. `/align` accepts 1–30 timestamped English captions, `videoId`, `lang=es`, `level` (easy/medium/hard), and a nonnegative `startIndex`. Its response contains `source`, `target`, and pairs with `srcStart`/`tgtStart` offsets. Cache keys include caption content and only complete successful batches are cached.

`POST /explain` accepts `phrase`, optional `source`/`context`, and `lang=es`. It returns `gloss`, `grammar_note`, `example`, and `formality`, with a bounded in-memory cache.

`MOCK=1 npm start` replaces **only** translation and explanations; TTS/STT are real provider calls and vocabulary/events use the real database. `npm run test:extension` verifies the mock HTTP contract without paid calls or database writes. See [the incremental testing guide](../docs/Testing%20the%20Extension.md).

## Local AI testing and demo switch

Use `npm run start:ollama` for local translation/explanations or `npm run start:gemini` for the demo. Both disable mock mode explicitly. Plain `npm start` defaults to Gemini and respects `AI_PROVIDER`/`MOCK` from your environment. Optional local settings: `OLLAMA_MODEL` (default `qwen2.5:3b`) and `OLLAMA_BASE_URL` (default `http://127.0.0.1:11434`). Gemini uses the existing `GEMINI_API_KEY`/`GEMINI_MODEL` settings. There is no automatic paid fallback.

`GET /health` now includes `ai.provider`, `ai.model`, and `ai.batch_size` (3 locally, 30 with Gemini). `npm run check:ai` checks a fresh real translation against the active provider; Gemini mode consumes quota. Caches include provider/model. Restart the backend and refresh YouTube after changing providers.

See [Ollama setup and the Gemini demo checklist](../docs/Ollama%20Testing%20and%20Gemini%20Demo.md). Ollama requires installing the app and downloading a local model. TTS/STT and database operations remain on their existing providers. `npm run test:ai` uses stubbed responses without paid calls.
