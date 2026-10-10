# Task: fix empty caption fetch in the Chrome extension

## Symptom (from DevTools console on a YouTube watch page)
```
[LL main] attempt 4 player: true tracks: 20
[LL content] got tracks Array(20)
[LL content] fetch status 200 length 0      <-- BUG
```
`main-world.ts` finds the player and its caption tracks fine. `content.ts` then fetches a track's
`baseUrl` and gets **HTTP 200 with an empty body**. The logs also show the whole sequence running
~3 times per page.

Ignore these console lines; they come from the ad blocker / YouTube itself, not us:
`ERR_BLOCKED_BY_CLIENT` (doubleclick), the link-preload warning, the `studio.youtube.com` postMessage warning.

## Root cause
YouTube now requires a proof-of-origin token (`pot` query param) on `/api/timedtext` requests.
The player adds it when it fetches captions itself; the raw `baseUrl` from
`ytInitialPlayerResponse` doesn't have it, so YouTube returns an empty 200.
Rebuilding the URL ourselves won't work, so stop fetching `baseUrl` directly.

## Fix: capture the player's own caption response
Turn CC on so the player requests captions (with the token) and intercept that response in the
MAIN world. We hide native captions with our overlay anyway.

### 1. `src/main-world.ts` (must be `world: "MAIN"`, `run_at: "document_start"` in manifest)
Patch fetch + XHR at load, before the player initializes:

```ts
const isCaptionUrl = (u: string) => u.includes('/api/timedtext');

function emit(url: string, body: string) {
  if (body) window.postMessage({ source: 'LL', type: 'captions', url, body }, '*');
}

const origFetch = window.fetch;
window.fetch = async function (...args: Parameters<typeof fetch>) {
  const res = await origFetch.apply(this, args);
  try {
    const url = typeof args[0] === 'string' ? args[0]
      : args[0] instanceof URL ? args[0].href : (args[0] as Request).url;
    if (isCaptionUrl(url)) res.clone().text().then(b => emit(url, b));
  } catch {}
  return res;
};

const origOpen = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: any[]) {
  const u = String(url);
  if (isCaptionUrl(u)) {
    this.addEventListener('load', () => {
      const body = this.responseType === 'json' ? JSON.stringify(this.response)
        : (this.responseType === '' || this.responseType === 'text') ? this.responseText : '';
      emit(u, body);
    });
  }
  // @ts-ignore
  return origOpen.call(this, method, url, ...rest);
};

function turnOnCaptions() {
  const player: any = document.querySelector('#movie_player');
  try { player?.setOption?.('captions', 'track', { languageCode: 'en' }); } catch {}
  const btn = document.querySelector<HTMLButtonElement>('.ytp-subtitles-button');
  if (btn?.getAttribute('aria-pressed') === 'false') btn.click();
}
```
Call `turnOnCaptions()` from the existing polling loop at the point it logs `player: true` and
tracks are found. Keep posting the track list as today if the content script uses it, but the
content script must no longer fetch `baseUrl`.

### 2. `src/content.ts`
Remove the `fetch(baseUrl)` call. Listen for the captured body instead:

```ts
let lastKey = '';

window.addEventListener('message', (e) => {
  if (e.source !== window || e.data?.source !== 'LL' || e.data.type !== 'captions') return;
  const url = new URL(e.data.url, location.origin);
  const key = `${url.searchParams.get('v')}:${url.searchParams.get('lang')}`;
  if (key === lastKey) return;            // dedupe repeated player requests
  lastKey = key;

  const lines = parseCaptions(e.data.body);
  console.log('[LL content] lines', lines.length, lines.slice(0, 5));
  // TODO: hand `lines` to the overlay / first ~30 lines to backend /align
});

document.addEventListener('yt-navigate-finish', () => { lastKey = ''; });

type Line = { start: number; end: number; text: string };

function parseCaptions(body: string): Line[] {
  const t = body.trim();
  if (t.startsWith('{')) {
    const data = JSON.parse(t);
    return (data.events ?? [])
      .filter((ev: any) => ev.segs)
      .map((ev: any) => ({
        start: ev.tStartMs / 1000,
        end: (ev.tStartMs + (ev.dDurationMs ?? 0)) / 1000,
        text: ev.segs.map((s: any) => s.utf8).join('').replace(/\n/g, ' ').trim(),
      }))
      .filter((l: Line) => l.text);
  }
  // XML fallback (srv3 / default format)
  const doc = new DOMParser().parseFromString(t, 'text/xml');
  const nodes = [...doc.querySelectorAll('p, text')];
  return nodes.map((n) => {
    const tAttr = n.getAttribute('t'), dAttr = n.getAttribute('d');
    const start = tAttr != null ? +tAttr / 1000 : +(n.getAttribute('start') ?? 0);
    const dur = dAttr != null ? +dAttr / 1000 : +(n.getAttribute('dur') ?? 0);
    return { start, end: start + dur, text: (n.textContent ?? '').replace(/\s+/g, ' ').trim() };
  }).filter((l) => l.text);
}
```

### 3. Also fix the triple-run
The logs show the main-world loop restarting several times (`attempt 0..4` repeated). Guard it
so only one loop runs per video id (e.g., store the current `videoId` and bail if unchanged).

## Done when
- `npm run build` passes (also fix the Vite warning: in `vite.config.ts` change the manifest import to
  `import manifest from './manifest.json' with { type: 'json' }`).
- Reload the extension at chrome://extensions, open a YouTube video with captions, and the console
  shows `[LL content] lines N [...]` with N > 0 and real timestamped text, **once** per video.
- If no `/api/timedtext` response is captured, check the Network tab filtered by `timedtext`
  and report whether the player made the request and what its response looked like.
