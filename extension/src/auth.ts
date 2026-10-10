import { getSettings } from './settings';

export const SESSION_KEY = 'session';

export type Session = {
  token: string;
  user: { id: string; email: string; name: string | null };
};

export async function getSession(): Promise<Session | null> {
  const got = await chrome.storage.local.get(SESSION_KEY);
  return (got[SESSION_KEY] as Session | undefined) ?? null;
}

// Other files use this to attach the login to backend calls.
export async function authHeaders(): Promise<Record<string, string>> {
  const s = await getSession();
  return s ? { Authorization: `Bearer ${s.token}` } : {};
}

// The backend rejected our session (expired or revoked): drop it so the panel asks to sign in again.
export async function clearSession() {
  await chrome.storage.local.remove(SESSION_KEY);
}

async function signIn(): Promise<Session> {
  const { token: accessToken } = await chrome.identity.getAuthToken({ interactive: true });
  if (!accessToken) throw new Error('Google sign-in was cancelled.');
  const { backendUrl } = await getSettings();
  const r = await fetch(new URL('/auth/google', backendUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken }),
  });
  if (!r.ok) {
    const failure = await r.json().catch(() => ({}));
    throw new Error(failure.error ?? `Sign-in failed (${r.status}).`);
  }
  const session = (await r.json()) as Session;
  await chrome.storage.local.set({ [SESSION_KEY]: session });
  return session;
}

async function signOut() {
  const res = await chrome.identity.getAuthToken({ interactive: false }).catch(() => null);
  const token = res?.token;
  if (token) {
    await chrome.identity.removeCachedAuthToken({ token });
    await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`).catch(() => {});
  }
  await clearSession();
}

// Call once from background.ts. Handles the signin / signout / whoami messages.
export function registerAuth() {
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) return;
    if (msg?.type === 'signin') {
      signIn()
        .then((s) => sendResponse({ ok: true, user: s.user }))
        .catch((e) => sendResponse({ ok: false, error: e.message === 'Failed to fetch'
          ? 'Cannot reach the backend. Check that the server is running.' : String(e.message) }));
      return true; // keeps the channel open for the async reply
    }
    if (msg?.type === 'signout') {
      signOut().then(() => sendResponse({ ok: true }));
      return true;
    }
    if (msg?.type === 'whoami') {
      getSession().then((s) => sendResponse({ user: s?.user ?? null }));
      return true;
    }
  });
}
