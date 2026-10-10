const isCaptionUrl = (u: string) => u.includes('/api/timedtext');
const currentVideoId = () => new URLSearchParams(location.search).get('v');

// Last messages posted, replayed when the content script (document_idle) announces it is ready.
let lastTracks: any = null;
let lastCaptions: any = null;

function emit(url: string, body: string) {
  if (!body) return;
  lastCaptions = { source: 'LL', type: 'captions', url, body };
  window.postMessage(lastCaptions, '*');
}

// Patch fetch + XHR before the player initializes so we see its own (pot-signed) caption requests.
const origFetch = window.fetch;
window.fetch = async function (this: typeof globalThis, ...args: Parameters<typeof fetch>) {
  const res = await origFetch.apply(this, args);
  try {
    const url = typeof args[0] === 'string' ? args[0]
      : args[0] instanceof URL ? args[0].href : (args[0] as Request).url;
    if (isCaptionUrl(url)) res.clone().text().then(b => emit(url, b)).catch(() => {});
  } catch {}
  return res;
};

const origOpen = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: any[]) {
  const u = String(url);
  if (isCaptionUrl(u)) {
    this.addEventListener('load', () => {
      try {
        const body = this.responseType === 'json' ? JSON.stringify(this.response)
          : (this.responseType === '' || this.responseType === 'text') ? this.responseText : '';
        emit(u, body);
      } catch {}
    });
  }
  // @ts-ignore
  return origOpen.call(this, method, url, ...rest);
};

function turnOnCaptions(languageCode: string) {
  const player: any = document.querySelector('#movie_player');
  const btn = document.querySelector<HTMLButtonElement>('.ytp-subtitles-button');
  if (btn?.getAttribute('aria-pressed') === 'false') btn.click();
  try {
    player?.loadModule?.('captions');
    player?.setOption?.('captions', 'track', { languageCode });
  } catch {}
}

// Only one polling loop per video id.
let loopVideoId: string | null = null;

function start() {
  const videoId = currentVideoId();
  if (!videoId) { loopVideoId = null; lastTracks = null; lastCaptions = null; return; }
  if (videoId === loopVideoId) return;
  loopVideoId = videoId;
  send(videoId);
}

function send(videoId: string, tries = 0) {
  if (videoId !== loopVideoId) return; // navigated away, a newer loop owns the page
  const player: any = document.getElementById('movie_player');
  const p = player?.getPlayerResponse?.();
  // After SPA navigation the player can still hold the previous video's response.
  const tracks = p?.videoDetails?.videoId === videoId
    ? p?.captions?.playerCaptionsTracklistRenderer?.captionTracks : undefined;
  console.log('[LL main] attempt', tries, 'player:', !!player, 'tracks:', tracks?.length);
  if (!tracks) { if (tries < 20) setTimeout(() => send(videoId, tries + 1), 500); return; }
  lastTracks = {
    source: 'LL', type: 'tracks', videoId,
    tracks: tracks.map((t: any) => ({ url: t.baseUrl, lang: t.languageCode, auto: t.kind === 'asr' }))
  };
  window.postMessage(lastTracks, '*');
  const t = tracks.find((t: any) => t.languageCode?.startsWith('en') && t.kind !== 'asr') ?? tracks.find((t: any) => t.languageCode?.startsWith('en'));
  if (t) turnOnCaptions(t.languageCode);
}

window.addEventListener('message', (e) => {
  if (e.source !== window || e.data?.source !== 'LL' || e.data.type !== 'ready') return;
  const videoId = currentVideoId();
  if (lastTracks?.videoId === videoId) window.postMessage(lastTracks, '*');
  if (lastCaptions && new URL(lastCaptions.url, location.origin).searchParams.get('v') === videoId) {
    window.postMessage(lastCaptions, '*');
  }
  start();
});
window.addEventListener('yt-navigate-finish', () => start());
console.log('[LL main] loaded');
