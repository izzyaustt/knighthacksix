import { useSyncExternalStore } from 'react';

export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
const STORAGE_KEY = 'langtube:session';

export type Session = {
  token: string;
  user: { id: string; email: string; name: string | null };
};

// Kept in localStorage so a reload stays signed in; a blocked storage just means signing in again.
let session: Session | null = (() => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Session | null; } catch { return null; }
})();
const listeners = new Set<() => void>();

function setSession(next: Session | null) {
  session = next;
  try {
    if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else localStorage.removeItem(STORAGE_KEY);
  } catch { /* storage unavailable */ }
  for (const l of listeners) l();
}

export const getSession = () => session;

export function useSession(): Session | null {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, getSession);
}

/** Exchanges a Google ID token from the Sign in with Google button for a backend session. */
export async function signIn(idToken: string): Promise<void> {
  const response = await fetch(new URL('/auth/google', BACKEND_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  if (!response.ok) {
    const failure = await response.json().catch(() => ({}));
    throw new Error(failure.error ?? `Sign-in failed (${response.status}).`);
  }
  setSession((await response.json()) as Session);
}

/** Also called when the backend rejects the session (expired or revoked). */
export function signOut() {
  window.google?.accounts.id.disableAutoSelect();
  setSession(null);
}

// The parts of Google Identity Services (https://accounts.google.com/gsi/client) we use.
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(config: { client_id: string; callback: (r: { credential: string }) => void }): void;
          renderButton(el: HTMLElement, options: Record<string, string | number>): void;
          disableAutoSelect(): void;
        };
      };
    };
  }
}
