// Chrome's getAuthToken can silently reuse the profile account. This web flow
// explicitly asks Google to show its account chooser on every button click.
export async function chooseGoogleAccount(clientId: string): Promise<string> {
  if (!clientId) throw new Error('Google account selection needs VITE_GOOGLE_CLIENT_ID in extension/.env.');
  const redirectUri = chrome.identity.getRedirectURL('google-auth');
  const state = crypto.randomUUID();
  const nonce = crypto.randomUUID();
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: clientId, redirect_uri: redirectUri, response_type: 'id_token',
    scope: 'openid email profile', prompt: 'select_account', state, nonce,
  }).toString();
  const result = await chrome.identity.launchWebAuthFlow({ url: url.href, interactive: true });
  if (!result) throw new Error('Google sign-in was cancelled.');
  const callback = new URL(result);
  const expected = new URL(redirectUri);
  if (callback.origin !== expected.origin || callback.pathname !== expected.pathname) {
    throw new Error('Unexpected Google sign-in redirect.');
  }
  const params = new URLSearchParams(callback.hash.slice(1));
  if (params.get('state') !== state) throw new Error('Google sign-in state did not match. Please try again.');
  if (params.has('error')) throw new Error('Google sign-in was cancelled or denied.');
  const token = params.get('id_token');
  if (!token) throw new Error('Google did not return an identity token.');
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (payload.nonce !== nonce) throw new Error('Invalid nonce');
  } catch { throw new Error('Google sign-in nonce did not match. Please try again.'); }
  // The backend verifies Google's signature, issuer, expiry and web-client audience.
  return token;
}
