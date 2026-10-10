console.log('[LL content] loaded');

type Line = { start: number; end: number; text: string };

let lastKey = '';

window.addEventListener('message', (e) => {
  if (e.source !== window || e.data?.source !== 'LL') return;
  if (e.data.type === 'tracks') { console.log('[LL content] got tracks', e.data.tracks); return; }
  if (e.data.type !== 'captions') return;
  const url = new URL(e.data.url, location.origin);
  const key = `${url.searchParams.get('v')}:${url.searchParams.get('lang')}`;
  if (key === lastKey) return; // dedupe repeated player requests

  let lines: Line[];
  try { lines = parseCaptions(e.data.body); } catch (err) {
    console.warn('[LL content] could not parse captions', err);
    return;
  }
  lastKey = key;
  console.log('[LL content] lines', lines.length, lines.slice(0, 5));
  // TODO: hand `lines` to the overlay / first ~30 lines to backend /align
});

document.addEventListener('yt-navigate-finish', () => { lastKey = ''; });

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

window.postMessage({ source: 'LL', type: 'ready' }, '*');
