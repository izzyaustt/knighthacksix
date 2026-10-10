const BACKEND = 'http://localhost:3000';

export type Session = {
  token: string;
  user: { id: string; email: string; name: string | null };
};

export async function getSession(): Promise<Session | null> {
  const { session } = await chrome.storage.local.get('session');
  return (session as Session | undefined) ?? null;
}

// Other files use this to attach the login to backend calls.
export async function authHeaders(): Promise<Record<string, string>> {
  const s = await getSession();
  return s ? { Authorization: `Bearer ${s.token}` } : {};
}

async function signIn(): Promise<Session> {
  const { token: accessToken } = await chrome.identity.getAuthToken({ interactive: true });
  const r = await fetch(`${BACKEND}/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken }),
  });
  if (!r.ok) throw new Error(`login failed: ${await r.text()}`);
  const session = (await r.json()) as Session;
  await chrome.storage.local.set({ session });
  return session;
}

async function signOut() {
  const res = await chrome.identity.getAuthToken({ interactive: false }).catch(() => null);
  const token = res?.token;
  if (token) {
    await chrome.identity.removeCachedAuthToken({ token });
    await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`).catch(() => {});
  }
  await chrome.storage.local.remove('session');
}

// Call once from background.ts. Handles the signin / signout / whoami messages.
export function registerAuth() {
    (globalThis as any).llAuth = { signIn, signOut, getSession };
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'signin') {
      signIn()
        .then((s) => sendResponse({ ok: true, user: s.user }))
        .catch((e) => sendResponse({ ok: false, error: String(e.message) }));
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