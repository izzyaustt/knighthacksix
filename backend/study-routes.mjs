import { isReviewVocabulary } from '../shared/tutor-feedback.ts';
import { LANGUAGES, isLanguage } from '../shared/languages.ts';
import { agentEnvKey } from './study-agent-config.mjs';
import { Router } from 'express';
import { createHash } from 'node:crypto';
import { transaction } from './database.mjs';
import { reviewConversation, validateReviewInput } from './study-review.mjs';

export const scenarios = {
  cafe: { title: 'At a café', description: 'Order a drink and something to eat.', opening: 'Soy la camarera. ¿Qué te gustaría tomar?' },
  friends: { title: 'Meet someone new', description: 'Introduce yourself and talk about your interests.', opening: '¿Qué te gusta hacer en tu tiempo libre?' },
  travel: { title: 'Plan a day out', description: 'Ask for directions and make plans.', opening: 'Tenemos un día libre. ¿Qué te gustaría visitar?' },
};

export function createStudyRouter(pool, requireUser, { fetchImpl = fetch, env = process.env, review = reviewConversation } = {}) {
  const router = Router();
  const configured = lang => !!(env.ELEVENLABS_API_KEY && env[agentEnvKey(lang)]);
  router.get('/study/config', requireUser, (req, res) => {
    const lang = req.query.lang ?? 'es';
    if (!isLanguage(lang)) return res.status(400).json({ error: 'Choose a supported language.' });
    res.json({ available: configured(lang), max_duration_seconds: 180,
      scenarios: Object.entries(scenarios).map(([id, { title, description }]) => ({ id, title, description })) });
  });
  router.post('/study/session', requireUser, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const { scenario = 'cafe', level = 'A2', lang = 'es' } = req.body ?? {};
    if (!isLanguage(lang) || typeof scenario !== 'string' || !Object.hasOwn(scenarios, scenario) || !['A1', 'A2', 'B1'].includes(level)) {
      return res.status(400).json({ error: 'Choose a supported conversation and level.' });
    }
    if (!configured(lang)) return res.status(503).json({ error: 'Conversation practice is not available yet. Please try again later.' });
    let words = [];
    try {
      const { rows } = await pool.query('SELECT word FROM public.vocab WHERE user_id = $1 AND lang = $2 ORDER BY saved_at DESC LIMIT 5', [req.userId, lang]);
      words = rows.map(row => row.word).filter(word => typeof word === 'string' && word.length <= 60);
    } catch { /* Practice also works without saved vocabulary. */ }
    try {
      const url = new URL('https://api.elevenlabs.io/v1/convai/conversation/get-signed-url');
      url.searchParams.set('agent_id', env[agentEnvKey(lang)]);
      const response = await fetchImpl(url, { headers: { 'xi-api-key': env.ELEVENLABS_API_KEY }, signal: AbortSignal.timeout(15000) });
      if (!response.ok) return res.status(502).json({ error: 'The conversation coach is unavailable. Please try again shortly.' });
      const { signed_url } = await response.json();
      if (typeof signed_url !== 'string' || !signed_url.startsWith('wss://api.elevenlabs.io/')) throw Error('Invalid conversation URL');
      res.json({ signed_url, max_duration_seconds: 180, dynamic_variables: {
        level, scenario: scenarios[scenario].title, opening_question: LANGUAGES[lang].openings[scenario],
        vocabulary: words.length ? words.join(', ') : 'No saved vocabulary yet',
      } });
    } catch { res.status(502).json({ error: 'Could not connect to the conversation coach. Please try again.' }); }
  });
  router.post('/study/review', requireUser, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    let input;
    try { input = validateReviewInput(req.body); }
    catch (error) { return res.status(400).json({ error: error.message }); }
    const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const cached = await pool.query("SELECT meta FROM public.learning_events WHERE user_id=$1 AND event_id=$2 AND event_type='review' LIMIT 1", [req.userId, input.review_id]);
    if (cached.rows.length) {
      if (cached.rows[0].meta.input_hash !== hash) return res.status(409).json({ error: 'This conversation was already reviewed with a different transcript.' });
      return res.json(cached.rows[0].meta.result);
    }
    let result;
    try { result = await review(input); }
    catch (error) {
      const invalid = error.code === 'INVALID_REVIEW' || /returned invalid JSON|empty response/.test(error.message ?? '');
      const timeout = /too long|timeout|timed out/i.test(error.message ?? '');
      console.warn('[study review]', invalid ? 'invalid_ai_rating' : timeout ? 'ai_timeout' : 'ai_unavailable');
      return res.status(502).json({ error: invalid
        ? 'The AI returned an incomplete rating. Nothing was saved. Retry feedback to try again.'
        : timeout ? 'The AI took too long to review your conversation. Your transcript is still here; retry feedback.'
        : 'The feedback AI is unavailable. Check the backend AI service, then retry feedback. Your transcript is still here.' });
    }
    if (result.status === 'insufficient') return res.json(result);
    // Save vocabulary and the rating together. Retries cannot add duplicate reviews.
    const saved = await transaction(pool, async client => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`${req.userId}|${input.review_id}`]);
      const previous = await client.query('SELECT meta FROM public.learning_events WHERE user_id=$1 AND event_id=$2 LIMIT 1', [req.userId, input.review_id]);
      if (previous.rows.length) {
        if (previous.rows[0].meta.input_hash !== hash) { const error = Error('Review ID already used'); error.status = 409; throw error; }
        return previous.rows[0].meta.result;
      }
      for (const word of result.struggles) {
        if (word.kind === 'grammar' || !isReviewVocabulary(word.word, input.lang)) continue;
        await client.query(`INSERT INTO public.vocab (user_id,lang,word,translation,status)
          VALUES ($1,$2,$3,$4,'learning') ON CONFLICT (user_id,lang,word)
          DO UPDATE SET status='learning',translation=EXCLUDED.translation,saved_at=now()`,
        [req.userId, input.lang, word.word, word.translation]);
      }
      await client.query(`INSERT INTO public.learning_events (event_id,user_id,event_type,lang,score,meta)
        VALUES ($1,$2,'review',$3,$4,$5)`, [input.review_id, req.userId, input.lang, result.score / 100,
        JSON.stringify({ kind: 'tutor_conversation', input_hash: hash, scenario: input.scenario, level: input.level, result })]);
      return result;
    });
    res.json(saved);
  });
  return router;
}
