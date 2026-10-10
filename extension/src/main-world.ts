function send(tries = 0) {
  const player: any = document.getElementById('movie_player');
  const p = player?.getPlayerResponse?.();
  const tracks = p?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  console.log('[LL main] attempt', tries, 'player:', !!player, 'tracks:', tracks?.length);
  if (!tracks) { if (tries < 20) setTimeout(() => send(tries + 1), 500); return; }
  window.postMessage({
    source: 'LL', type: 'tracks', videoId: p.videoDetails.videoId,
    tracks: tracks.map((t: any) => ({ url: t.baseUrl, lang: t.languageCode, auto: t.kind === 'asr' }))
  }, '*');
}
window.addEventListener('message', (e) => {
  if (e.data?.source === 'LL' && e.data.type === 'ready') send();
});
window.addEventListener('yt-navigate-finish', () => send());
console.log('[LL main] loaded');