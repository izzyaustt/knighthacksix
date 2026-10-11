import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { transaction } from './database.mjs';
import { normalize } from './src/scoring.ts';

const TIMEZONE = 'America/New_York';
const IMMERSION_GOAL_HOURS = 500;
// A saved phrase is mastered after this many speaking attempts at or above this score.
const MASTERY_SCORE = 0.9;
const MASTERY_ATTEMPTS = 3;
const STATUSES = ['new', 'learning', 'known'];
const notesInFlight = new Set();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function bad(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}
function text(value, name, fallback, max = 200) {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw bad(`${name} is required and must be text (max ${max})`);
  return value.trim();
}
function optional(value, name, max = 200) {
  return value == null ? null : text(value, name, undefined, max);
}
function integer(value, name, fallback, maximum) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) throw bad(`${name} must be an integer`);
  const n = Number(value);
  if (n < 1 || n > maximum) throw bad(`${name} must be between 1 and ${maximum}`);
  return n;
}
function id(value, name) {
  if (value === undefined) return randomUUID();
  if (typeof value !== 'string' || !UUID.test(value)) throw bad(`${name} must be a UUID`);
  return value.toLowerCase();
}
function number(value, name, max = Number.MAX_SAFE_INTEGER) {
  if (value == null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max) throw bad(`${name} is out of range`);
  return value;
}
// The user always comes from the verified session (requireUser), never from the request body or query.
function identity(req, input) {
  if (typeof req.userId !== 'string' || !req.userId) throw bad('sign in required', 401);
  return [req.userId, text(input.lang, 'lang', 'es', 20)];
}
function numericRows(rows, fields) {
  return rows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) =>
    [key, fields.includes(key) && value !== null ? Number(value) : value])));
}

export function databaseErrors(error, _req, res, _next) {
  if (error.status) return res.status(error.status).json({ error: error.message });
  if (error.code === '23503') return res.status(404).json({ error: 'User or attempt does not exist' });
  if (['23514', '22P02', '22003'].includes(error.code)) return res.status(400).json({ error: 'Invalid learning data' });
  console.error('[database] Request failed', typeof error.code === 'string' ? error.code : 'unavailable');
  res.status(503).json({ error: 'Database temporarily unavailable' });
}

/** Records the distinct words of translated caption lines so /stats/videos can report word coverage. */
export async function saveVideoWords(pool, videoId, lang, lines) {
  const words = [...new Set(lines.flatMap(line => normalize(line.target ?? '')))].filter(w => w.length <= 100);
  if (!words.length) return;
  await pool.query(`INSERT INTO video_words (video_id,lang,word) SELECT $1,$2,unnest($3::text[])
    ON CONFLICT DO NOTHING`, [videoId, lang, words]);
}

export function createDataRouter(pool, requireUser, { explain } = {}) {
  const router = Router();

  // Fills in a missing grammar note in the background; the dashboard picks it up on a later poll.
  function backfillNote(user, lang, row) {
    const key = `${user}|${lang}|${row.word}`;
    if (!explain || process.env.MOCK === '1' || notesInFlight.has(key)) return;
    notesInFlight.add(key);
    explain({ phrase: row.word, source: row.translation ?? '', context: '' })
      .then(e => pool.query('UPDATE vocab SET note=$4 WHERE user_id=$1 AND lang=$2 AND word=$3 AND note IS NULL',
        [user, lang, row.word, String(e.grammar_note).slice(0, 1000)]))
      .catch(() => {})
      .finally(() => notesInFlight.delete(key));
  }

  router.get('/health/database', async (_req, res) => {
    await pool.query('SELECT 1');
    res.json({ ok: true, database: 'connected' });
  });

  router.post('/events', requireUser, async (req, res) => {
    const body = req.body ?? {};
    const [user, lang] = identity(req, body);
    const type = text(body.event_type, 'event_type');
    if (!['lookup', 'save', 'review', 'caption_view'].includes(type)) throw bad('Use /stt for shadow_attempt; unsupported event_type');
    const eventId = id(body.event_id, 'event_id');
    const video = optional(body.video_id, 'video_id');
    const word = optional(body.word, 'word', 2000);
    const score = number(body.score, 'score', 1);
    const meta = body.meta ?? {};
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) throw bad('meta must be an object');
    if ('watched_seconds' in meta) number(meta.watched_seconds, 'watched_seconds');
    const result = await transaction(pool, async client => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`${user}|${eventId}`]);
      const previous = await client.query(`SELECT event_id, time,
        (event_type=$3 AND lang=$4 AND video_id IS NOT DISTINCT FROM $5
         AND word IS NOT DISTINCT FROM $6 AND score IS NOT DISTINCT FROM $7
         AND meta=$8::jsonb) AS matches
        FROM learning_events WHERE user_id=$1 AND event_id=$2 LIMIT 1`,
      [user, eventId, type, lang, video, word, score, JSON.stringify(meta)]);
      if (previous.rows.length) {
        if (!previous.rows[0].matches) throw bad('event_id already belongs to different data', 409);
        return { ...previous.rows[0], duplicate: true };
      }
      const inserted = await client.query(`INSERT INTO learning_events
        (event_id,user_id,event_type,lang,video_id,word,score,meta)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING event_id,time`,
      [eventId, user, type, lang, video, word, score, JSON.stringify(meta)]);
      return { ...inserted.rows[0], duplicate: false };
    });
    res.json({ ok: true, event_id: result.event_id, time: result.time, duplicate: result.duplicate });
  });

  router.post('/vocab', requireUser, async (req, res) => {
    const body = req.body ?? {};
    const [user, lang] = identity(req, body);
    const word = text(body.word, 'word', undefined, 2000);
    const translation = optional(body.translation, 'translation', 4000);
    const video = optional(body.video_id, 'video_id');
    const timestamp = number(body.video_ts, 'video_ts');
    await transaction(pool, async client => {
      const inserted = await client.query(`INSERT INTO vocab
        (user_id,lang,word,translation,video_id,video_ts) VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (user_id,lang,word) DO NOTHING RETURNING word`,
      [user, lang, word, translation, video, timestamp]);
      if (inserted.rowCount) {
        await client.query(`INSERT INTO learning_events (event_id,user_id,event_type,lang,word,video_id)
          VALUES ($1,$2,'save',$3,$4,$5)`, [randomUUID(), user, lang, word, video]);
      } else {
        await client.query(`UPDATE vocab SET translation=$4,video_id=$5,video_ts=$6
          WHERE user_id=$1 AND lang=$2 AND word=$3`, [user, lang, word, translation, video, timestamp]);
      }
    });
    res.json({ ok: true });
  });

  router.get('/vocab', requireUser, async (req, res) => {
    const [user, lang] = identity(req, req.query);
    const limit = integer(req.query.limit, 'limit', 100, 1000);
    const { rows } = await pool.query('SELECT * FROM vocab WHERE user_id=$1 AND lang=$2 ORDER BY saved_at DESC,word LIMIT $3', [user, lang, limit]);
    res.json({ words: rows });
  });

  router.patch('/vocab', requireUser, async (req, res) => {
    const body = req.body ?? {};
    const [user, lang] = identity(req, body);
    const word = text(body.word, 'word', undefined, 2000);
    if (!STATUSES.includes(body.status)) throw bad(`status must be one of ${STATUSES.join(', ')}`);
    const updated = await pool.query('UPDATE vocab SET status=$4 WHERE user_id=$1 AND lang=$2 AND word=$3', [user, lang, word, body.status]);
    if (!updated.rowCount) throw bad('Word is not saved', 404);
    res.json({ ok: true, status: body.status });
  });

  router.get('/vocab/revisit', requireUser, async (req, res) => {
    const [user, lang] = identity(req, req.query);
    const limit = integer(req.query.limit, 'limit', 3, 20);
    const { rows } = await pool.query(`SELECT v.word,v.translation,v.note,v.status,v.video_id,v.video_ts,v.saved_at,
      (SELECT count(*) FROM shadow_attempts a WHERE a.user_id=v.user_id AND a.lang=v.lang AND a.status='completed'
        AND lower(trim(a.target_text))=lower(trim(v.word)) AND a.score<$4) AS misses
      FROM vocab v WHERE v.user_id=$1 AND v.lang=$2 AND v.status<>'known'
      ORDER BY misses DESC,v.saved_at,v.word LIMIT $3`, [user, lang, limit, MASTERY_SCORE]);
    for (const row of rows) if (row.note === null) backfillNote(user, lang, row);
    res.json({ words: numericRows(rows, ['misses']) });
  });

  router.get('/stats/summary', requireUser, async (req, res) => {
    const [user, lang] = identity(req, req.query);
    const [watched, mastery] = await Promise.all([
      pool.query('SELECT coalesce(sum(watched_minutes),0) AS minutes FROM dashboard_activity WHERE user_id=$1 AND lang=$2', [user, lang]),
      pool.query(`SELECT count(*) AS total,count(*) FILTER (WHERE status='known') AS mastered
        FROM vocab WHERE user_id=$1 AND lang=$2`, [user, lang]),
    ]);
    const total = Number(mastery.rows[0].total), mastered = Number(mastery.rows[0].mastered);
    res.json({ immersion: { hours: Number(watched.rows[0].minutes) / 60, goal_hours: IMMERSION_GOAL_HOURS },
      mastery: { total, learning: total - mastered, mastered } });
  });

  router.get('/stats/videos', requireUser, async (req, res) => {
    const [user, lang] = identity(req, req.query);
    const limit = integer(req.query.limit, 'limit', 2, 20);
    const { rows } = await pool.query(`SELECT video_id,count(*) AS events,max(time) AS last_time,
      coalesce(sum(CASE WHEN event_type='caption_view' AND jsonb_typeof(meta->'watched_seconds')='number'
        THEN (meta->>'watched_seconds')::numeric ELSE 0 END),0)/60.0 AS watched_minutes
      FROM learning_events WHERE user_id=$1 AND lang=$2 AND video_id IS NOT NULL AND video_id<>''
      GROUP BY video_id ORDER BY events DESC,last_time DESC LIMIT $3`, [user, lang, limit]);
    const videos = numericRows(rows, ['events', 'watched_minutes']);
    if (!videos.length) return res.json({ videos });
    const [captions, lookups, saved] = await Promise.all([
      pool.query('SELECT video_id,word FROM video_words WHERE lang=$1 AND video_id=ANY($2::text[])', [lang, videos.map(v => v.video_id)]),
      pool.query(`SELECT DISTINCT word FROM learning_events
        WHERE user_id=$1 AND lang=$2 AND event_type='lookup' AND word IS NOT NULL`, [user, lang]),
      pool.query('SELECT word,status FROM vocab WHERE user_id=$1 AND lang=$2', [user, lang]),
    ]);
    // A caption word counts as known unless it was looked up or saved and has not been mastered since.
    const tokens = list => new Set(list.flatMap(r => normalize(r.word)));
    const unknown = tokens([...lookups.rows, ...saved.rows.filter(r => r.status !== 'known')]);
    for (const word of tokens(saved.rows.filter(r => r.status === 'known'))) unknown.delete(word);
    const byVideo = Map.groupBy(captions.rows, r => r.video_id);
    res.json({ videos: videos.map(v => {
      const words = byVideo.get(v.video_id) ?? [];
      const known = words.filter(r => !unknown.has(r.word)).length;
      return { ...v, total_words: words.length, known_words: known, known_pct: words.length ? known / words.length : null };
    }) });
  });

  router.get('/stats/score-trend', requireUser, async (req, res) => {
    const [user, lang] = identity(req, req.query);
    const days = integer(req.query.days, 'days', 14, 365);
    const { rows } = await pool.query(`SELECT day::text,
      sum(avg_score*attempts)/sum(attempts) AS avg_score,sum(attempts) AS attempts,
      bool_or(is_synthetic) AS includes_synthetic FROM dashboard_score_trend
      WHERE user_id=$1 AND lang=$2 AND day >= (now() AT TIME ZONE $4)::date - ($3::int-1)
      GROUP BY day ORDER BY day`, [user, lang, days, TIMEZONE]);
    res.json({ timezone: TIMEZONE, points: numericRows(rows, ['avg_score', 'attempts']), includes_synthetic: rows.some(r => r.includes_synthetic) });
  });

  router.get('/stats/activity', requireUser, async (req, res) => {
    const [user, lang] = identity(req, req.query);
    const days = integer(req.query.days, 'days', 14, 365);
    const { rows } = await pool.query(`SELECT day::text,sum(shadow_attempts) AS shadow_attempts,
      sum(lookups) AS lookups,sum(vocab_saved) AS vocab_saved,sum(watched_minutes) AS watched_minutes,
      bool_or(is_synthetic) AS includes_synthetic FROM dashboard_activity
      WHERE user_id=$1 AND lang=$2 AND day >= (now() AT TIME ZONE $4)::date - ($3::int-1)
      GROUP BY day ORDER BY day`, [user, lang, days, TIMEZONE]);
    const points = numericRows(rows, ['shadow_attempts', 'lookups', 'vocab_saved', 'watched_minutes']);
    res.json({ timezone: TIMEZONE, points: points.map(p => ({ ...p, minutes: p.watched_minutes })), includes_synthetic: rows.some(r => r.includes_synthetic) });
  });

  router.get('/stats/recent', requireUser, async (req, res) => {
    const [user, lang] = identity(req, req.query);
    const limit = integer(req.query.limit, 'limit', 50, 1000);
    if (req.query.cursor !== undefined) throw bad('Cursor pagination is not implemented; poll a recent snapshot');
    let since = null;
    if (req.query.since !== undefined) {
      if (typeof req.query.since !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(req.query.since)
        || !Number.isFinite(Date.parse(req.query.since))) throw bad('since must be an ISO timestamp with timezone');
      since = req.query.since;
    }
    const { rows } = await pool.query(`SELECT * FROM dashboard_recent
      WHERE user_id=$1 AND lang=$2 AND ($4::timestamptz IS NULL OR time>$4)
      ORDER BY time DESC,event_id DESC LIMIT $3`, [user, lang, limit, since]);
    res.json({ events: rows, includes_synthetic: rows.some(r => r.is_synthetic) });
  });

  router.get('/stats/trouble-words', requireUser, async (req, res) => {
    const [user, lang] = identity(req, req.query);
    const limit = integer(req.query.limit, 'limit', 10, 100);
    const { rows } = await pool.query(`SELECT word,sum(attempts) AS attempts,sum(misses) AS misses,
      sum(misses)::float8/sum(attempts) AS miss_rate,bool_or(is_synthetic) AS includes_synthetic
      FROM dashboard_trouble_words WHERE user_id=$1 AND lang=$2 GROUP BY word
      ORDER BY miss_rate DESC,attempts DESC,word LIMIT $3`, [user, lang, limit]);
    res.json({ words: numericRows(rows, ['attempts', 'misses', 'miss_rate']).map(r => ({ ...r, avg_score: 1-r.miss_rate })) });
  });

  router.get('/stats/heatmap', requireUser, async (req, res) => {
    const [user, lang] = identity(req, req.query);
    const days = integer(req.query.days, 'days', 28, 365);
    const { rows } = await pool.query(`SELECT extract(dow FROM time AT TIME ZONE $4)::int AS dow,
      extract(hour FROM time AT TIME ZONE $4)::int AS hour,count(*) AS count,
      bool_or(is_synthetic) AS includes_synthetic FROM learning_events
      WHERE user_id=$1 AND lang=$2 AND time >= (((now() AT TIME ZONE $4)::date - ($3::int-1))::timestamp AT TIME ZONE $4)
      GROUP BY dow,hour`, [user, lang, days, TIMEZONE]);
    const indexed = new Map(rows.map(r => [`${r.dow}|${r.hour}`, r]));
    const cells = Array.from({ length: 168 }, (_, i) => ({ dow: Math.floor(i/24), hour: i%24,
      count: Number(indexed.get(`${Math.floor(i/24)}|${i%24}`)?.count ?? 0) }));
    res.json({ timezone: TIMEZONE, cells, includes_synthetic: rows.some(r => r.includes_synthetic) });
  });

  router.use(databaseErrors);
  return router;
}

export function createAttemptHandler(pool, { stt, scoreAttempt }) {
  return async (req, res, next) => {
    let user, attemptId;
    let ownsClaim = false;
    try {
      const body = req.body ?? {};
      if (!req.file?.buffer?.length) throw bad('audio file is required');
      const target = text(body.target_text, 'target_text', undefined, 10000);
      [user] = identity(req, body);
      const lang = text(body.lang, 'lang', 'es', 20);
      const video = optional(body.video_id, 'video_id');
      const videoTs = body.video_ts === undefined ? null : number(Number(body.video_ts), 'video_ts');
      attemptId = id(body.attempt_id, 'attempt_id');
      const args = [user, attemptId, target, lang, video, videoTs];
      const claimed = await pool.query(`INSERT INTO shadow_attempts
        (user_id,attempt_id,target_text,lang,video_id,video_ts) VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (user_id,attempt_id) DO NOTHING RETURNING attempt_id`, args);
      ownsClaim = claimed.rowCount > 0;
      if (!ownsClaim) {
        const { rows } = await pool.query('SELECT * FROM shadow_attempts WHERE user_id=$1 AND attempt_id=$2', [user, attemptId]);
        const previous = rows[0];
        if (previous.target_text !== target || previous.lang !== lang || previous.video_id !== video || previous.video_ts !== videoTs) throw bad('attempt_id already belongs to different context', 409);
        if (previous.status === 'completed') return res.json({ attempt_id: attemptId, transcript: previous.transcript,
          score: previous.score, words: previous.words, event_saved: true, saved_at: previous.completed_at, cached: true });
        if (previous.status === 'failed') {
          const retry = await pool.query(`UPDATE shadow_attempts SET status='processing',error_code=NULL,created_at=now()
            WHERE user_id=$1 AND attempt_id=$2 AND status='failed' RETURNING attempt_id`, [user, attemptId]);
          ownsClaim = retry.rowCount > 0;
        }
        if (!ownsClaim) {
          res.set('Retry-After', '5');
          return res.status(409).json({ error: 'Attempt is processing', code: 'ATTEMPT_PROCESSING' });
        }
      }
      let result;
      try { result = await stt(req.file.buffer, req.file.mimetype, lang); }
      catch (error) { throw bad(error instanceof Error ? error.message : 'Speech provider request failed', 502); }
      const { score, words } = scoreAttempt(target, result.text);
      let savedAt;
      try {
        savedAt = await transaction(pool, async client => {
          const completed = await client.query(`UPDATE shadow_attempts SET status='completed',transcript=$3,
            score=$4,words=$5,completed_at=now() WHERE user_id=$1 AND attempt_id=$2 AND status='processing'
            RETURNING completed_at`, [user, attemptId, result.text, score, JSON.stringify(words)]);
          if (!completed.rowCount) throw bad('Attempt state changed', 409);
          const time = completed.rows[0].completed_at;
          await client.query(`INSERT INTO learning_events
            (time,event_id,user_id,event_type,video_id,lang,score,attempt_id,meta)
            VALUES ($1,$2,$3,'shadow_attempt',$4,$5,$6,$2,$7)`,
          [time, attemptId, user, video, lang, score, JSON.stringify({ target_text: target, transcript: result.text, words, video_ts: videoTs })]);
          // Practicing a saved phrase moves it to learning, then to known after enough good attempts.
          await client.query(`UPDATE vocab v SET status=CASE WHEN (SELECT count(*) FROM shadow_attempts a
              WHERE a.user_id=v.user_id AND a.lang=v.lang AND a.status='completed' AND a.score>=$4
                AND lower(trim(a.target_text))=lower(trim(v.word)))>=$5 THEN 'known' ELSE 'learning' END
            WHERE v.user_id=$1 AND v.lang=$2 AND lower(trim(v.word))=lower(trim($3)) AND v.status<>'known'`,
          [user, lang, target, MASTERY_SCORE, MASTERY_ATTEMPTS]);
          return time;
        });
      } catch (error) {
        if (error.status) throw error;
        await pool.query(`UPDATE shadow_attempts SET status='failed',error_code='DB_SAVE_FAILED'
          WHERE user_id=$1 AND attempt_id=$2 AND status='processing'`, [user, attemptId]).catch(() => {});
        return res.json({ attempt_id: attemptId, transcript: result.text, score, words, event_saved: false, saved_at: null });
      }
      res.json({ attempt_id: attemptId, transcript: result.text, score, words, event_saved: true, saved_at: savedAt });
    } catch (error) {
      if (ownsClaim) await pool.query(`UPDATE shadow_attempts SET status='failed',error_code='ATTEMPT_FAILED'
        WHERE user_id=$1 AND attempt_id=$2 AND status='processing'`, [user, attemptId]).catch(() => {});
      databaseErrors(error, req, res, next);
    }
  };
}
