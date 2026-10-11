import { Router } from 'express';

export const scenarios = {
  cafe: { title: 'At a café', description: 'Order a drink and something to eat.', opening: 'Soy la camarera. ¿Qué te gustaría tomar?' },
  friends: { title: 'Meet someone new', description: 'Introduce yourself and talk about your interests.', opening: '¿Qué te gusta hacer en tu tiempo libre?' },
  travel: { title: 'Plan a day out', description: 'Ask for directions and make plans.', opening: 'Tenemos un día libre. ¿Qué te gustaría visitar?' },
};

export function createStudyRouter(pool, requireUser, { fetchImpl = fetch, env = process.env } = {}) {
  const router = Router();
  const configured = () => !!(env.ELEVENLABS_API_KEY && env.ELEVENLABS_AGENT_ID);
  router.get('/study/config', requireUser, (_req, res) => {
    res.json({ available: configured(), max_duration_seconds: 180,
      scenarios: Object.entries(scenarios).map(([id, { title, description }]) => ({ id, title, description })) });
  });
  router.post('/study/session', requireUser, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const { scenario = 'cafe', level = 'A2' } = req.body ?? {};
    if (typeof scenario !== 'string' || !Object.hasOwn(scenarios, scenario) || !['A1', 'A2', 'B1'].includes(level)) {
      return res.status(400).json({ error: 'Choose a supported conversation and level.' });
    }
    if (!configured()) return res.status(503).json({ error: 'Conversation practice is not available yet. Please try again later.' });
    let words = [];
    try {
      const { rows } = await pool.query('SELECT word FROM public.vocab WHERE user_id = $1 AND lang = $2 ORDER BY saved_at DESC LIMIT 5', [req.userId, 'es']);
      words = rows.map(row => row.word).filter(word => typeof word === 'string' && word.length <= 60);
    } catch { /* Practice also works without saved vocabulary. */ }
    try {
      const url = new URL('https://api.elevenlabs.io/v1/convai/conversation/get-signed-url');
      url.searchParams.set('agent_id', env.ELEVENLABS_AGENT_ID);
      const response = await fetchImpl(url, { headers: { 'xi-api-key': env.ELEVENLABS_API_KEY }, signal: AbortSignal.timeout(15000) });
      if (!response.ok) return res.status(502).json({ error: 'The conversation coach is unavailable. Please try again shortly.' });
      const { signed_url } = await response.json();
      if (typeof signed_url !== 'string' || !signed_url.startsWith('wss://api.elevenlabs.io/')) throw Error('Invalid conversation URL');
      res.json({ signed_url, max_duration_seconds: 180, dynamic_variables: {
        level, scenario: scenarios[scenario].title, opening_question: scenarios[scenario].opening,
        vocabulary: words.length ? words.join(', ') : 'No saved vocabulary yet',
      } });
    } catch { res.status(502).json({ error: 'Could not connect to the conversation coach. Please try again.' }); }
  });
  return router;
}
