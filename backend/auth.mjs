import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';

const google = new OAuth2Client();

function sessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is not configured');
  return secret;
}

function verified(p) {
  if (!p?.sub || !p.email) throw new Error('Google account has no email');
  if (p.email_verified !== true && p.email_verified !== 'true') throw new Error('Google email is not verified');
  return { sub: p.sub, email: p.email, name: p.name ?? null };
}

// The dashboard sends an ID token (web client); the extension sends an access token (Chrome client).
async function verifyGoogle({ idToken, accessToken }) {
  if (typeof idToken === 'string' && idToken) {
    if (!process.env.GOOGLE_WEB_CLIENT_ID) throw new Error('GOOGLE_WEB_CLIENT_ID is not configured');
    const ticket = await google.verifyIdToken({ idToken, audience: process.env.GOOGLE_WEB_CLIENT_ID });
    return verified(ticket.getPayload());
  }
  if (typeof accessToken === 'string' && accessToken) {
    const clientId = process.env.GOOGLE_EXTENSION_CLIENT_ID;
    if (!clientId) throw new Error('GOOGLE_EXTENSION_CLIENT_ID is not configured');
    // Any Google app can mint an access token for a user, so check it was issued to our extension.
    const info = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`);
    if (!info.ok) throw new Error('invalid Google token');
    const t = await info.json();
    if (t.aud !== clientId && t.azp !== clientId) throw new Error('Google token was issued to a different app');
    const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!r.ok) throw new Error('invalid Google token');
    const p = await r.json();
    if (p.sub !== t.sub) throw new Error('invalid Google token');
    return verified(p);
  }
  throw new Error('idToken or accessToken required');
}

export function requireUser(req, res, next) {
  const header = req.headers.authorization ?? '';
  if (!header.startsWith('Bearer ')) return res.status(401).json({ error: 'sign in required' });
  try {
    const claims = jwt.verify(header.slice(7), sessionSecret());
    req.userId = claims.uid;
    req.userEmail = claims.email;
    next();
  } catch (e) {
    if (e.message === 'SESSION_SECRET is not configured') return next(e);
    res.status(401).json({ error: 'sign in required' });
  }
}

export function authRoutes(pool) {
  const router = Router();

  router.post('/auth/google', async (req, res) => {
    let user;
    try {
      user = await verifyGoogle(req.body ?? {});
    } catch (e) {
      console.error('[auth]', e.message);
      return res.status(401).json({ error: String(e.message) });
    }
    await pool.query(
      `INSERT INTO public.users (user_id, display_name, email)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE
         SET display_name = EXCLUDED.display_name, email = EXCLUDED.email`,
      [user.sub, user.name ?? user.email, user.email],
    );
    const token = jwt.sign({ uid: user.sub, email: user.email }, sessionSecret(), { expiresIn: '30d' });
    res.json({ token, user: { id: user.sub, email: user.email, name: user.name } });
  });

  router.get('/auth/me', requireUser, (req, res) => res.json({ id: req.userId, email: req.userEmail }));
  return router;
}
