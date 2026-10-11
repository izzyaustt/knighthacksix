import { useEffect, useRef, useState } from 'react';
import { signIn } from '../auth.ts';
import { SignInFlowers } from './SignInFlowers.tsx';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const GSI_SRC = 'https://accounts.google.com/gsi/client';

function loadGsi(): Promise<void> {
  if (window.google?.accounts) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GSI_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load Google sign-in. Check your connection and reload.'));
    document.head.append(script);
  });
}

export function SignIn() {
  const button = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(CLIENT_ID ? null : 'VITE_GOOGLE_CLIENT_ID is not set in dashboard/.env.');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!CLIENT_ID) return;
    let cancelled = false;
    let requested = false;
    loadGsi().then(() => {
      if (cancelled || !button.current || !window.google) return;
      window.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        auto_select: false,
        button_auto_select: false,
        callback: ({ credential }) => {
          // Ignore unsolicited credentials and callbacks from an old login view.
          if (cancelled || !requested) return;
          requested = false;
          setBusy(true);
          setError(null);
          signIn(credential).catch((e: Error) => {
            setError(e.message === 'Failed to fetch' ? "Can't reach the backend. Start it from backend/ and try again." : e.message);
            setBusy(false);
          });
        },
      });
      window.google.accounts.id.renderButton(button.current, {
        theme: 'outline', size: 'large', shape: 'pill', text: 'signin_with', width: 280,
        click_listener: () => { requested = true; },
      });
    }).catch((e: Error) => setError(e.message));
    return () => { cancelled = true; };
  }, []);

  return (
    <main className="signin">
      <SignInFlowers />
      <div className="signin-card">
        <img src="/logo.png" alt="langtube" className="signin-logo" />
        <h1>Your learning dashboard</h1>
        <p className="muted">Sign in with the Google account you use in the langtube extension to see your progress.</p>
        <div ref={button} className="signin-button" aria-busy={busy} />
        {busy && <p className="muted">Signing in…</p>}
        {error && <p className="banner" role="alert">{error}</p>}
        <p className="signin-note">A little learning, every day.</p>
      </div>
    </main>
  );
}
