-- Run through setup.py apply: psql applies this file in one transaction.
-- TimescaleDB must already be installed on the Tiger Data service.
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
    RAISE EXCEPTION 'TimescaleDB must be enabled before applying this schema';
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.users (
  user_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  email TEXT,
  target_lang TEXT NOT NULL DEFAULT 'es',
  level TEXT NOT NULL DEFAULT 'A2',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email TEXT;

CREATE TABLE IF NOT EXISTS public.vocab (
  user_id TEXT NOT NULL REFERENCES public.users(user_id),
  lang TEXT NOT NULL DEFAULT 'es',
  word TEXT NOT NULL CHECK (length(trim(word)) > 0),
  translation TEXT,
  video_id TEXT,
  video_ts DOUBLE PRECISION CHECK (video_ts >= 0 AND video_ts < 'Infinity'::float8),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'learning', 'known')),
  saved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, lang, word)
);

ALTER TABLE public.vocab ADD COLUMN IF NOT EXISTS note TEXT;

-- Distinct normalized caption words per video, shared by all users.
-- /align fills it as captions are translated; /stats/videos reads it for word coverage.
CREATE TABLE IF NOT EXISTS public.video_words (
  video_id TEXT NOT NULL,
  lang TEXT NOT NULL DEFAULT 'es',
  word TEXT NOT NULL CHECK (length(word) > 0),
  PRIMARY KEY (video_id, lang, word)
);

-- A regular table owns global per-user attempt uniqueness and cached results.
-- The backend atomically claims an ID before calling the speech provider.
CREATE TABLE IF NOT EXISTS public.shadow_attempts (
  user_id TEXT NOT NULL REFERENCES public.users(user_id),
  attempt_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'completed', 'failed')),
  target_text TEXT NOT NULL CHECK (length(trim(target_text)) > 0),
  lang TEXT NOT NULL DEFAULT 'es',
  video_id TEXT,
  video_ts DOUBLE PRECISION CHECK (video_ts >= 0 AND video_ts < 'Infinity'::float8),
  transcript TEXT,
  score DOUBLE PRECISION CHECK (score >= 0 AND score <= 1),
  words JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(words) = 'array'),
  is_synthetic BOOLEAN NOT NULL DEFAULT false,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, attempt_id),
  CHECK (status <> 'completed' OR
    (transcript IS NOT NULL AND score IS NOT NULL AND completed_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS public.learning_events (
  time TIMESTAMPTZ NOT NULL DEFAULT now(),
  event_id UUID NOT NULL,
  user_id TEXT NOT NULL REFERENCES public.users(user_id),
  event_type TEXT NOT NULL
    CHECK (event_type IN ('lookup', 'save', 'shadow_attempt', 'review', 'caption_view')),
  video_id TEXT,
  word TEXT,
  lang TEXT NOT NULL DEFAULT 'es',
  score DOUBLE PRECISION CHECK (score >= 0 AND score <= 1),
  attempt_id UUID,
  is_synthetic BOOLEAN NOT NULL DEFAULT false,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(meta) = 'object'),
  PRIMARY KEY (time, event_id),
  FOREIGN KEY (user_id, attempt_id)
    REFERENCES public.shadow_attempts(user_id, attempt_id),
  CHECK (event_type <> 'shadow_attempt' OR
    (attempt_id IS NOT NULL AND event_id = attempt_id AND score IS NOT NULL)),
  CHECK (event_type = 'shadow_attempt' OR attempt_id IS NULL),
  CHECK (NOT (meta ? 'watched_seconds') OR
    (jsonb_typeof(meta->'watched_seconds') = 'number' AND
     (meta->>'watched_seconds')::numeric >= 0))
);

SELECT create_hypertable(
  'public.learning_events', 'time',
  chunk_time_interval => INTERVAL '1 day',
  if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS learning_events_user_time_idx
  ON public.learning_events (user_id, time DESC, event_id);
CREATE INDEX IF NOT EXISTS learning_events_user_type_time_idx
  ON public.learning_events (user_id, event_type, time DESC);
CREATE INDEX IF NOT EXISTS shadow_attempts_completed_idx
  ON public.shadow_attempts (user_id, completed_at DESC)
  WHERE status = 'completed';
CREATE INDEX IF NOT EXISTS vocab_user_saved_idx
  ON public.vocab (user_id, saved_at DESC);

-- Initial dashboard views read live data, with no aggregate refresh delay.
-- API queries must filter by user_id, lang, date range, and synthetic status.
CREATE OR REPLACE VIEW public.dashboard_score_trend AS
SELECT user_id, lang, is_synthetic,
       (completed_at AT TIME ZONE 'America/New_York')::date AS day,
       avg(score) AS avg_score,
       count(*) AS attempts
FROM public.shadow_attempts
WHERE status = 'completed'
GROUP BY user_id, lang, is_synthetic,
         (completed_at AT TIME ZONE 'America/New_York')::date;

CREATE OR REPLACE VIEW public.dashboard_activity AS
SELECT user_id, lang, is_synthetic,
       (time AT TIME ZONE 'America/New_York')::date AS day,
       count(*) FILTER (WHERE event_type = 'shadow_attempt') AS shadow_attempts,
       count(*) FILTER (WHERE event_type = 'lookup') AS lookups,
       count(*) FILTER (WHERE event_type = 'save') AS vocab_saved,
       coalesce(sum(CASE WHEN event_type = 'caption_view'
         AND jsonb_typeof(meta->'watched_seconds') = 'number'
         THEN (meta->>'watched_seconds')::numeric ELSE 0 END), 0) / 60.0
         AS watched_minutes
FROM public.learning_events
GROUP BY user_id, lang, is_synthetic,
         (time AT TIME ZONE 'America/New_York')::date;

CREATE OR REPLACE VIEW public.dashboard_recent AS
SELECT e.time, e.event_id, e.user_id, e.event_type, e.video_id, e.word,
       e.lang, e.score, e.attempt_id, e.is_synthetic, e.meta,
       a.target_text, a.transcript, a.words, a.video_ts
FROM public.learning_events e
LEFT JOIN public.shadow_attempts a
  ON a.user_id = e.user_id AND a.attempt_id = e.attempt_id;

CREATE OR REPLACE VIEW public.dashboard_trouble_words AS
SELECT a.user_id, a.lang, a.is_synthetic,
       lower(trim(w.item->>'word')) AS word,
       count(*) AS attempts,
       count(*) FILTER (WHERE w.item->>'status' IN ('missed', 'substituted')) AS misses,
       (count(*) FILTER (WHERE w.item->>'status' IN ('missed', 'substituted')))::float8
         / count(*) AS miss_rate
FROM public.shadow_attempts a
CROSS JOIN LATERAL jsonb_array_elements(a.words) AS w(item)
WHERE a.status = 'completed'
  AND length(trim(w.item->>'word')) > 0
  AND w.item->>'status' IN ('correct', 'missed', 'substituted')
GROUP BY a.user_id, a.lang, a.is_synthetic, lower(trim(w.item->>'word'));

INSERT INTO public.users (user_id, display_name, target_lang, level)
VALUES ('demo-user', 'Demo learner', 'es', 'A2')
ON CONFLICT (user_id) DO NOTHING;
