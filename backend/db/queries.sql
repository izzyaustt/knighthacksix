-- Reference queries for backend routes. Bind values through your database driver.
-- $1 is user_id, $2 is target language, $3 is a date cutoff or limit as indicated.

-- GET /stats/score-trend: $3 = first day (date), e.g. 7 days ago.
SELECT day, sum(avg_score * attempts) / sum(attempts) AS avg_score,
       sum(attempts) AS attempts, bool_or(is_synthetic) AS includes_synthetic
FROM public.dashboard_score_trend
WHERE user_id = $1 AND lang = $2 AND day >= $3::date
GROUP BY day ORDER BY day;

-- GET /stats/activity: $3 = first day (date).
SELECT day, sum(shadow_attempts) AS shadow_attempts, sum(lookups) AS lookups,
       sum(vocab_saved) AS vocab_saved, sum(watched_minutes) AS watched_minutes,
       bool_or(is_synthetic) AS includes_synthetic
FROM public.dashboard_activity
WHERE user_id = $1 AND lang = $2 AND day >= $3::date
GROUP BY day ORDER BY day;

-- GET /stats/recent: bounded snapshot, $3 = row limit.
-- Snapshot polling is the initial implementation: deduplicate by event_id.
SELECT * FROM public.dashboard_recent
WHERE user_id = $1 AND lang = $2
ORDER BY time DESC, event_id DESC LIMIT $3;

-- GET /stats/trouble-words: $3 = row limit.
SELECT word, sum(attempts) AS attempts, sum(misses) AS misses,
       sum(misses)::float8 / sum(attempts) AS miss_rate,
       bool_or(is_synthetic) AS includes_synthetic
FROM public.dashboard_trouble_words
WHERE user_id = $1 AND lang = $2
GROUP BY word ORDER BY miss_rate DESC, attempts DESC, word LIMIT $3;
