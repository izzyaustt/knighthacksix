import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';

const google = new OAuth2Client();

async function verifyGoogle({ idToken, accessToken }) {
  if (idToken) {
    const ticket = await google.verifyIdToken({ idToken, audience: process.env.GOOGLE_WEB_CLIENT_ID });
    const p = ticket.getPayload();
    return { sub: p.sub, email: p.email, name: p.name ?? null };
  }
  if (accessToken) {
    const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!r.ok) throw new Error('invalid Google token');
    const p = await r.json();
    return { sub: p.sub, email: p.email, name: p.name ?? null };
  }
  throw new Error('idToken or accessToken required');
}

export function requireUser(req, res, next) {
  try {
    const t = (req.headers.authorization ?? '').replace('Bearer ', '');
    const claims = jwt.verify(t, process.env.SESSION_SECRET);
    req.userId = claims.uid;
    req.userEmail = claims.email;
    next();
  } catch {
    res.status(401).json({ error: 'sign in required' });
  }
}

export function authRoutes(pool) {
  const router = Router();

  router.post('/auth/google', async (req, res) => {
    try {
      const user = await verifyGoogle(req.body ?? {});
      await pool.query(
        `INSERT INTO public.users (user_id, display_name, email)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id) DO UPDATE
           SET display_name = EXCLUDED.display_name, email = EXCLUDED.email`,
        [user.sub, user.name ?? user.email, user.email],
      );
      const token = jwt.sign({ uid: user.sub, email: user.email }, process.env.SESSION_SECRET, { expiresIn: '30d' });
      res.json({ token, user: { id: user.sub, email: user.email, name: user.name } });
    } catch (e) {
      console.error('[auth]', e.message);
      res.status(401).json({ error: String(e.message) });
    }
  });

  router.get('/auth/me', requireUser, (req, res) => res.json({ id: req.userId, email: req.userEmail }));
  return router;
}