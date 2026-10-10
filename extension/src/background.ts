// Service worker: toggles the panel on icon click, forwards events/saves to the backend,
// and opens the dashboard with context.
import { dashboardLink, getSettings, type DashboardContext } from './settings';

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
