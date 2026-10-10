# Tiger Data Database Setup

This folder creates the project's database schema and supplies reference dashboard queries. It does not implement an HTTP backend or dashboard.

## Configuration

The setup script reads `knighthacksix/.env` and uses `TIGER_DATA_CONNECTION_STRING` (or `DATABASE_URL`). Keep that file Git-ignored. Never paste the connection URL into source code, command arguments, logs, or the frontend.

Requirements: Python 3, the PostgreSQL `psql` client, and a Tiger Data service with TimescaleDB enabled. No Python packages are required. On this Mac the client is available at `/opt/homebrew/opt/libpq/bin/psql`; the script also searches PATH and the standard Intel Homebrew location.

## Commands

From `knighthacksix/`:

```sh
python3 backend/db/setup.py check
python3 backend/db/setup.py apply
python3 backend/db/setup.py verify
```

- `check`: connects read-only and reports the server, TimescaleDB version, and public table names.
- `apply`: applies `schema.sql` as one transaction and inserts `demo-user` if absent.
- `verify`: inserts temporary fixtures in a transaction, checks the full attempt-to-dashboard path, and rolls the fixtures back. It then lists the schema and verifies the demo user.

The script requires SSL and passes credentials through the subprocess environment rather than URL arguments. It redacts credentials from captured output. PostgreSQL client startup files are disabled.

The schema can be reapplied to the same schema version: existing tables/indexes are retained, views are refreshed, and the demo user is not overwritten. `CREATE TABLE IF NOT EXISTS` does not upgrade a differently shaped existing table. Future schema changes need a migration rather than blindly rerunning this script.

## Tables

| Table | Purpose | Key |
| --- | --- | --- |
| `users` | Demo learner and language/level settings | `user_id` |
| `vocab` | Saved phrases, translations, video locations, and learning status | `(user_id, lang, word)` |
| `shadow_attempts` | Attempt request state and scoring result | `(user_id, attempt_id)` |
| `learning_events` | Time-series lookup, save, review, watch, and shadowing events | `(time, event_id)` |

`learning_events` is a hypertable with one-day time chunks. Scores use 0-1; the UI formats percentages. `words` is a JSON array of `{word, heard, status}`. Word statuses and provider output must still be validated in the backend.

`meta.watched_seconds`, when present, must be a nonnegative JSON number. Report actual active playback duration; loading captions is not time watched.

## Dashboard views

- `dashboard_score_trend`: completed attempts grouped by New York calendar day.
- `dashboard_activity`: daily attempt, lookup, save counts and watched minutes.
- `dashboard_recent`: learning events with linked attempt text/transcript/word results.
- `dashboard_trouble_words`: per-word misses/substitutions and miss rate.

Daily views group by user, language, and synthetic-data flag. `queries.sql` shows how to combine groups for the API, including a weighted score average. Never average daily subgroup averages without weighting by attempt counts.

The views query current data directly, so a saved attempt is immediately visible. Continuous aggregates, compression policies, a heatmap, and bulk synthetic history are later additions.

## Backend handoff

1. Use `demo-user` and `es` in both clients initially.
2. Atomically claim `(user_id, attempt_id)` using `INSERT ... ON CONFLICT DO NOTHING RETURNING ...` before calling Scribe. One row returned means this request owns the claim.
3. A conflict requires inspecting the existing attempt: return a completed result, report processing, or coordinate a retry of a failed attempt. Compare request context to prevent reusing an ID for different audio/target text.
4. Finish an attempt by updating its result and inserting its shadowing event in the same transaction. Lock/check the attempt state so only one request completes it. Use `completed_at` as the event time and `attempt_id` as `event_id`.
5. Route retries through `shadow_attempts`, not directly through event inserts. The hypertable key prevents duplicate `(time, event_id)` pairs; it does not globally deduplicate IDs with different timestamps.
6. Implement a timeout/lease policy for abandoned processing claims before exposing retries. The current database stores claim state, but no worker or provider orchestration is implemented.
7. Validate that attempt and event score/language/context agree before committing. Foreign keys alone do not enforce those relationships.
8. Log other event types through `/events`; validate and deduplicate those requests in the backend too.
9. Bind query parameters using the chosen driver. Filter every statistics request by user and language and apply limits/date ranges.

For the initial live demo, poll a bounded recent snapshot every two seconds and deduplicate by event ID. This avoids pretending timestamps or sequences are commit-order cursors. It is not a lossless event feed under high throughput: if more events arrive than the snapshot limit between polls, older ones may be skipped. Implement a reliable opaque cursor/feed if that guarantee becomes necessary.

Synthetic rows retain `is_synthetic`; keep them clearly labeled in the UI. The setup creates only the demo user, without seeded learning history. Verification fixtures are discarded.

Views are data helpers, not authorization boundaries. The current configuration uses the provided administrative database connection; the backend should use a dedicated application role before deployment. The extension and dashboard must never receive database credentials.

## Related plan

See [Dashboard Integration Plan](../../docs/Dashboard%20Integration%20Plan.md) for endpoint proposals and team ownership. This setup uses snapshot polling as the initial approach; the plan's reliable cursor remains future API work. Vocabulary uniqueness includes language to keep the same word in different target languages distinct.

Tiger Data requires hypertable unique keys to include the time partition column: [unique-index guidance](https://www.tigerdata.com/docs/build/performance-optimization/hypertables-and-unique-indexes).
