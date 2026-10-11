// Hosting runs this before building, so a public bundle never silently uses localhost.
const backend = process.env.VITE_BACKEND_URL;
let url;
try { url = new URL(backend); } catch { throw Error('Set VITE_BACKEND_URL to the deployed HTTPS backend origin in your hosting settings.'); }
if (url.protocol !== 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
  throw Error('VITE_BACKEND_URL must be a public HTTPS origin without a path or credentials.');
}
if (!process.env.VITE_GOOGLE_CLIENT_ID?.endsWith('.apps.googleusercontent.com')) {
  throw Error('Set VITE_GOOGLE_CLIENT_ID to the Google Web application client ID in your hosting settings.');
}
console.log('Dashboard deployment configuration is ready.');
