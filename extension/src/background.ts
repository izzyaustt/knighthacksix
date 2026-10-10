import { dashboardLink, getSettings, type DashboardContext } from './settings';
const allowed = new Set(['/health', '/align', '/explain', '/tts', '/stt', '/vocab', '/events']);

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type !== 'api') return;
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith('https://www.youtube.com/') || !allowed.has(message.path)) {
    reply({ ok: false, error: 'Unsupported extension request.' });
    return;
  }
  (async () => {
    const settings = await getSettings();
    let body: BodyInit;
    const headers: Record<string, string> = {};
    if (message.path === '/stt') {
      const { audio, mime, ...context } = message.body;
      if (typeof audio !== 'string' || audio.length > 35 * 1024 * 1024) throw new Error('Recording is too large.');
      const form = new FormData();
      form.append('audio', new Blob([Uint8Array.from(atob(audio), c => c.charCodeAt(0))], { type: mime }), 'attempt.webm');
      for (const [key, value] of Object.entries({ ...context, user_id: settings.userId })) form.append(key, String(value));
      body = form;
    } else {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(['/events', '/vocab'].includes(message.path) ? { ...message.body, user_id: settings.userId } : message.body);
    }
    const response = await fetch(new URL(message.path, settings.backendUrl || 'http://localhost:3000'), {
      method: message.path === '/health' ? 'GET' : 'POST', headers, body: message.path === '/health' ? undefined : body, signal: AbortSignal.timeout(120000),
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
      ? 'Cannot reach the configured backend. Check the server and connection, then click Retry.' : error.message });
  });
  return true;
});

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id != null && tab.url?.startsWith('https://www.youtube.com/')) {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'll:toggle-panel' });
      return;
    } catch {
      // Content script not in this tab yet (tab predates install or reload). Fall through.
    }
  }
  await openDashboard({});
});

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  switch (msg?.type) {
    case 'll:event':
      post('/events', msg.event).then(reply);
      return true;
    case 'll:vocab':
      post('/vocab', msg.item).then(reply);
      return true;
    case 'll:open-dashboard':
      openDashboard(msg.ctx ?? {}).then(() => reply({ ok: true }));
      return true;
  }
  return undefined;
});

async function post(path: string, body: Record<string, unknown>) {
  const s = await getSettings();
  if (!s.backendUrl) return { ok: false, skipped: 'no backendUrl' };
  try {
    const res = await fetch(new URL(path, s.backendUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ user_id: s.userId, ...body }),
    });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    console.warn('[LL worker] POST', path, 'failed', err);
    return { ok: false, error: String(err) };
  }
}

async function openDashboard(ctx: DashboardContext) {
  const s = await getSettings();
  try {
    await chrome.tabs.create({ url: dashboardLink(s, ctx) });
  } catch (err) {
    console.warn('[LL worker] bad dashboardUrl', s.dashboardUrl, err);
  }
}