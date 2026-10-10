const allowed = new Set(['/align', '/explain', '/tts', '/stt', '/vocab', '/events']);

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type !== 'api') return;
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith('https://www.youtube.com/') || !allowed.has(message.path)) {
    reply({ ok: false, error: 'Unsupported extension request.' });
    return;
  }
  (async () => {
    let body: BodyInit;
    const headers: Record<string, string> = {};
    if (message.path === '/stt') {
      const { audio, mime, ...context } = message.body;
      if (typeof audio !== 'string' || audio.length > 35 * 1024 * 1024) throw new Error('Recording is too large.');
      const form = new FormData();
      form.append('audio', new Blob([Uint8Array.from(atob(audio), c => c.charCodeAt(0))], { type: mime }), 'attempt.webm');
      for (const [key, value] of Object.entries(context)) form.append(key, String(value));
      body = form;
    } else {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(message.body);
    }
    const response = await fetch(`http://localhost:3000${message.path}`, {
      method: 'POST', headers, body, signal: AbortSignal.timeout(120000),
    });
    if (!response.ok) {
      const failure = await response.json().catch(() => ({}));
      throw new Error(failure.error ?? `Backend returned ${response.status}.`);
    }
    if (message.path === '/tts') {
      const bytes = new Uint8Array(await response.arrayBuffer());
      let binary = '';
      for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      return { audio: btoa(binary) };
    }
    return response.json();
  })().then(data => reply({ ok: true, data })).catch(error => {
    reply({ ok: false, error: error.message === 'Failed to fetch'
      ? 'Cannot reach the backend. Start it on localhost:3000, then click Retry.' : error.message });
  });
  return true;
});
