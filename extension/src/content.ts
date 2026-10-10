console.log('[LL content] loaded');

window.addEventListener('message', async (e) => {
  if (e.source !== window || e.data?.source !== 'LL' || e.data.type !== 'tracks') return;
  console.log('[LL content] got tracks', e.data.tracks);
  const t = e.data.tracks.find((t: any) => t.lang.startsWith('en') && !t.auto) ?? e.data.tracks[0];
  const res = await fetch(t.url + '&fmt=json3');
  const text = await res.text();
  console.log('[LL content] fetch status', res.status, 'length', text.length);
  if (!text) return;
  const json = JSON.parse(text);
  const lines = json.events.filter((ev: any) => ev.segs).map((ev: any) => ({
    start: ev.tStartMs / 1000,
    end: (ev.tStartMs + (ev.dDurationMs ?? 0)) / 1000,
    text: ev.segs.map((s: any) => s.utf8).join('').replace(/\n/g, ' ').trim()
  }));
  console.log('[LL content] lines', lines);
});

window.postMessage({ source: 'LL', type: 'ready' }, '*');