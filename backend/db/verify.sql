-- Exercise a complete attempt and dashboard visibility, then discard fixtures.
BEGIN;
SET LOCAL statement_timeout = '30s';

DO $$
DECLARE
  test_user TEXT := 'db-verification-' || gen_random_uuid()::text;
  test_attempt UUID := gen_random_uuid();
  test_time TIMESTAMPTZ := clock_timestamp();
  result_count BIGINT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM timescaledb_information.hypertables
                 WHERE hypertable_schema = 'public' AND hypertable_name = 'learning_events') THEN
    RAISE EXCEPTION 'learning_events is not a hypertable';
  END IF;

  INSERT INTO public.users (user_id, display_name) VALUES (test_user, 'Temporary verification');
  INSERT INTO public.shadow_attempts
    (user_id, attempt_id, status, target_text, transcript, score, words,
     is_synthetic, completed_at)
  VALUES (test_user, test_attempt, 'completed', 'hola mundo', 'hola', 0.5,
    '[{"word":"hola","heard":"hola","status":"correct"},
      {"word":"mundo","heard":null,"status":"missed"}]', true, test_time);

  -- The ordinary attempt table rejects the same ID, independently of time.
  BEGIN
    INSERT INTO public.shadow_attempts (user_id, attempt_id, target_text)
    VALUES (test_user, test_attempt, 'hola mundo');
    RAISE EXCEPTION 'Duplicate attempt was accepted';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  INSERT INTO public.learning_events
    (time, event_id, user_id, event_type, score, attempt_id, is_synthetic)
  VALUES (test_time, test_attempt, test_user, 'shadow_attempt', 0.5, test_attempt, true);
  INSERT INTO public.learning_events
    (time, event_id, user_id, event_type, is_synthetic, meta)
  VALUES (test_time, gen_random_uuid(), test_user, 'caption_view', true,
          '{"watched_seconds":120}');

  SELECT count(*) INTO result_count FROM public.dashboard_recent
  WHERE user_id = test_user AND event_type = 'shadow_attempt'
    AND transcript = 'hola' AND score = 0.5;
  IF result_count <> 1 THEN RAISE EXCEPTION 'Recent-attempt view failed'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.dashboard_score_trend
    WHERE user_id = test_user AND attempts = 1 AND avg_score = 0.5) THEN
    RAISE EXCEPTION 'Score-trend view failed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.dashboard_activity
    WHERE user_id = test_user AND shadow_attempts = 1 AND watched_minutes = 2) THEN
    RAISE EXCEPTION 'Activity view failed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.dashboard_trouble_words
    WHERE user_id = test_user AND word = 'mundo' AND misses = 1 AND miss_rate = 1) THEN
    RAISE EXCEPTION 'Trouble-word view failed';
  END IF;
  RAISE NOTICE 'PASS: hypertable, duplicate attempt protection, recent attempt, trend, activity, trouble words';
END
$$;

ROLLBACK;

SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('users', 'vocab', 'shadow_attempts', 'learning_events',
                    'dashboard_recent', 'dashboard_score_trend',
                    'dashboard_activity', 'dashboard_trouble_words')
ORDER BY table_name;

SELECT hypertable_name, num_dimensions
FROM timescaledb_information.hypertables
WHERE hypertable_schema = 'public' AND hypertable_name = 'learning_events';

SELECT user_id, display_name, target_lang, level FROM public.users WHERE user_id = 'demo-user';
SELECT count(*) AS verification_users_remaining
FROM public.users WHERE user_id LIKE 'db-verification-%';
