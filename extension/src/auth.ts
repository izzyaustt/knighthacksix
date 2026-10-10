import { getSettings } from './settings';
import { chooseGoogleAccount } from './google-signin';

export const SESSION_KEY = 'session';
let authRevision = 0;
let sessionWrite: Promise<void> = Promise.resolve();

function writeSession(action: () => Promise<void>): Promise<void> {
  const next = sessionWrite.then(action);
  sessionWrite = next.catch(() => {});
  return next;
}

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
  authRevision++;
  await writeSession(() => chrome.storage.local.remove([SESSION_KEY, 'll:signedIn']));
}

async function signIn(): Promise<Session> {
  const revision = ++authRevision;
  const idToken = await chooseGoogleAccount(import.meta.env.VITE_GOOGLE_CLIENT_ID || '');
  if (revision !== authRevision) throw new Error('Sign-in was cancelled. Please sign in again.');
  const { backendUrl } = await getSettings();
  const r = await fetch(new URL('/auth/google', backendUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  if (!r.ok) {
    const failure = await r.json().catch(() => ({}));
    throw new Error(failure.error ?? `Sign-in failed (${r.status}).`);
  }
  const session = (await r.json()) as Session;
  await writeSession(async () => {
    if (revision !== authRevision) throw new Error('Sign-in was cancelled. Please sign in again.');
    await chrome.storage.local.set({ [SESSION_KEY]: session });
  });
  if (revision !== authRevision) throw new Error('Sign-in was cancelled. Please sign in again.');
  return session;
}

async function signOut() {
  // Complete local logout before best-effort Google cache cleanup.
  await clearSession();
  try {
    void chrome.identity.clearAllCachedAuthTokens().catch(() => {});
  } catch { /* Local session is already cleared. */ }
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
      signOut().then(() => sendResponse({ ok: true }))
        .catch((e) => sendResponse({ ok: false, error: String(e.message) }));
      return true;
    }
    if (msg?.type === 'whoami') {
      getSession().then((s) => sendResponse({ user: s?.user ?? null }));
      return true;
    }
  });
}
