// The glanceable panel opened from the extension icon. Injected into the YouTube page inside a
// shadow root (per spec: an injected panel, not Chrome's side panel API), so it can drive the
// video directly. Captions stay on the video; the panel shows a lookup only once a word is picked
// (practice.ts renders into the lookup view).
import { LANGUAGES, isLanguage } from '../../shared/languages';
import { getSettings } from './settings';
import LOGO_FULL from './assets/logo-full.png?inline';
import LOGO_MARK from './assets/logo-mark.png?inline';
import { PANEL_CSS } from './panel-css';
import { dayKey, emptyDay, isStatsKey, readRecent, type DayStats } from './stats';

export type PanelStatus =
  | { kind: 'idle' }                                   // not on a watch page
  | { kind: 'waiting' }                                // watch page, captions not captured yet
  | { kind: 'aligning'; done: number; total: number }  // batches translated so far
  | { kind: 'ready'; total: number; failed: number };

export type PanelDeps = {
  getVideo(): HTMLVideoElement | null;
  getVideoId(): string | null;
  pendingWatch(): ReadonlyMap<number, number>;
  captionsOn(): boolean;
  setCaptionsOn(on: boolean): void;
  /** Re-run translation for batches that failed. */
  retry(): void;
  /** The panel was closed; stop anything running in the lookup view. */
  onClose?(): void;
  /** The lookup view was left with its back button. */
  onLookupBack?(): void;
};

export type PanelController = {
  toggle(force?: boolean): void;
  setStatus(status: PanelStatus): void;
  reset(): void;
  /** Word lookup view. The content script owns what goes inside `el`. */
  practice: { el: HTMLElement; show(title?: string): void; hide(): void };
};

type Alert = { key: string; tone: 'info' | 'warn' | 'suggest'; text: string; actions?: [string, () => void][] };

// Static markup only. Every dynamic string goes in through textContent.
const HTML = `
<aside class="panel" id="panel" role="complementary" aria-label="Learning panel" tabindex="-1">
 <div class="view signin" id="view-signin" hidden>
  <div class="signin-top"><button type="button" class="icon collapse-panel" aria-label="Collapse panel" title="Collapse"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 17l5-5-5-5M6 17l5-5-5-5"></path></svg></button></div>
  <div class="brand">
    <button type="button" class="brand-link" id="brand-link" title="Open dashboard"><img class="wordmark" src="${LOGO_FULL}" alt="langtube — open dashboard" width="300" height="126"></button>
    <p class="tagline">watch it, speak it, improve it</p>
    <p class="pitch">Learn a language from the YouTube videos you already watch. Tap any subtitle word to look it up and practice saying it.</p>
  </div>
  <div class="signin-actions">
    <button type="button" class="google" id="signin">
      <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
      </svg>
      Sign in with Google
    </button>
    <p class="signin-error" id="signin-error" role="alert" hidden></p>
    <p class="legal">By continuing you agree to our <a href="#" data-todo="terms">Terms</a> and <a href="#" data-todo="privacy">Privacy Policy</a>.</p>
  </div>
 </div>

 <div class="view home" id="view-home">
  <header>
    <img class="logo" src="${LOGO_MARK}" alt="" width="34" height="40">
    <div class="titles">
      <div class="name">langtube</div>
      <div class="video-title" id="video-title"></div>
    </div>
    <span class="pill" id="pill" role="status"></span>
    <button type="button" class="icon sign-out" aria-label="Sign out" title="Sign out"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3"></path><path d="M10 16l-4-4 4-4M6 12h10"></path></svg></button>
    <button type="button" class="icon collapse-panel" aria-label="Collapse panel" title="Collapse"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 17l5-5-5-5M6 17l5-5-5-5"></path></svg></button><button type="button" class="icon close-panel" aria-label="Close panel"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg></button>
  </header>

  <section class="card"><label class="row" for="learning-language">Learning language <select id="learning-language" aria-label="Learning language"></select></label><p id="language-note" hidden>Tagalog is in preview. Double-check caption translations and word meanings.</p></section>

  <section id="alerts" aria-live="polite"></section>

  <section class="stats">
    <div class="card"><div class="label">Practice today</div><div class="value" id="minutes">0m</div></div>
    <div class="card"><div class="label">Lookups today</div><div class="value" id="lookups">0</div></div>
  </section>

  <section class="tip" id="tip">
    <div class="tip-icon" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11V5a2 2 0 014 0v6"></path><path d="M13 10a2 2 0 014 0v1a2 2 0 014 0v4a6 6 0 01-6 6h-2a6 6 0 01-5-2.7L5.5 15a2 2 0 013.4-2L9 13"></path></svg></div>
    <div class="tip-body">
      <h2>Tap any word</h2>
      <p>Any word in the captions on the video opens its meaning, the clip it came from, and a chance to say it yourself. The video pauses while you look.</p>
    </div>
  </section>

  <section class="card">
    <div class="spark-head">
      <span class="label">Watching</span>
      <div class="seg" aria-label="Activity range">
        <button type="button" data-range="30m" aria-pressed="true">30m</button>
        <button type="button" data-range="24h" aria-pressed="false">24h</button>
      </div>
    </div>
    <svg id="spark" role="img" aria-label=""></svg>
    <div class="spark-axis"><span id="axis-start">30 min ago</span><span>now</span></div>
  </section>

  <section class="card">
    <div class="row">
      <span id="cc-label">Bilingual captions</span>
      <button type="button" class="switch" id="cc" role="switch" aria-checked="true" aria-labelledby="cc-label"><span></span></button>
    </div>
  </section>

  <footer><button type="button" class="dash-link">Open dashboard <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5"></path></svg></button></footer>
 </div>

 <div class="view lookup" id="view-lookup" hidden>
  <div class="topbar">
    <button type="button" class="icon" id="lookup-back" aria-label="Back to subtitles">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"></path></svg>
    </button>
    <span class="topbar-title"><img class="logo small" src="${LOGO_MARK}" alt="" width="26" height="30"><span class="eyebrow" id="lookup-title">Word lookup</span></span>
    <div class="top-actions"><button type="button" class="icon sign-out" aria-label="Sign out" title="Sign out"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3"></path><path d="M10 16l-4-4 4-4M6 12h10"></path></svg></button><button type="button" class="icon collapse-panel" aria-label="Collapse panel" title="Collapse"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 17l5-5-5-5M6 17l5-5-5-5"></path></svg></button><button type="button" class="icon close-panel" aria-label="Close panel"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg></button></div>
  </div>
  <div class="lookup-body" id="practice"></div>
  <footer><button type="button" class="dash-link">Open dashboard <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5"></path></svg></button></footer>
 </div>
</aside>
<button type="button" class="bubble" id="bubble" aria-label="Expand langtube panel" title="langtube" hidden><img src="${LOGO_MARK}" alt="" width="26" height="30"></button>`;

const SESSION_KEY = 'session'; // written by auth.ts in the service worker
const FONTS_ID = 'll-fonts';
const FONTS_URL = 'https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700;800&family=Caveat:wght@600&display=swap';

export function createPanel(deps: PanelDeps): PanelController {
  const host = document.createElement('div');
  host.id = 'll-panel-host';
  host.style.display = 'none';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `<style>${PANEL_CSS}</style>${HTML}`;
  const $ = (id: string) => shadow.getElementById(id) as HTMLElement;

  const languageSelect = $('learning-language') as HTMLSelectElement;
  for (const [code, language] of Object.entries(LANGUAGES)) {
    const option = document.createElement('option'); option.value = code; option.textContent = language.name; languageSelect.append(option);
  }
  const showLanguageNote = () => { $('language-note').hidden = languageSelect.value !== 'fil'; };
  void getSettings().then(settings => { languageSelect.value = settings.langTgt; showLanguageNote(); });
  languageSelect.addEventListener('change', async () => {
    languageSelect.disabled = true;
    try {
      const settings = await getSettings();
      await chrome.storage.local.set({ settings: { ...settings, langTgt: languageSelect.value } });
      showLanguageNote();
    } catch { $('pill').textContent = 'Could not change language. Try again.'; }
    finally { languageSelect.disabled = false; }
  });

  let open = false;
  let collapsed = false; // open, but shrunk to the logo bubble
  let status: PanelStatus = { kind: 'idle' };
  let range: '30m' | '24h' = '30m';
  let stats: { today: DayStats; yesterday: DayStats } = { today: emptyDay(), yesterday: emptyDay() };
  let timer = 0;
  let alertKey: string | null = null;

  // The service worker owns the Google session (auth.ts); the panel only asks and listens for changes.
  let signedIn = false;
  let lookupOpen = false;
  let authRevision = 0;
  try {
    const revision = authRevision;
    void chrome.runtime.sendMessage({ type: 'whoami' }).then((r) => {
      if (revision === authRevision) { signedIn = !!r?.user; renderView(); }
    }).catch(() => {});
  } catch { /* orphaned after extension reload */ }

  // Fonts must be declared in the page document to be usable inside the shadow root.
  if (!document.getElementById(FONTS_ID)) {
    const link = document.createElement('link');
    link.id = FONTS_ID; link.rel = 'stylesheet'; link.href = FONTS_URL;
    document.head.append(link);
  }

  wire();
  renderView();

  function renderView() {
    const view = !signedIn ? 'signin' : lookupOpen ? 'lookup' : 'home';
    for (const name of ['signin', 'home', 'lookup']) $(`view-${name}`).hidden = name !== view;
  }

  /* ---------- data ---------- */

  async function loadStats() {
    try { stats = await readRecent(); } catch { /* orphaned after extension reload */ }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    const nextLanguage = (changes.settings?.newValue as { langTgt?: unknown } | undefined)?.langTgt;
    if (isLanguage(nextLanguage)) { languageSelect.value = nextLanguage; showLanguageNote(); }
    // Signed in from another tab, signed out, or the backend rejected an expired session.
    if (SESSION_KEY in changes) {
      authRevision++;
      if (!changes[SESSION_KEY].newValue) showSignIn();
      else { signedIn = true; renderView(); }
    }
    if (!open) return;
    const keys = Object.keys(changes);
    if (keys.some(isStatsKey)) void loadStats().then(renderLive);
  });

  function todayWatchSeconds() {
    const today = dayKey();
    let secs = Object.values(stats.today.watch).reduce((a, b) => a + b, 0);
    for (const [minute, s] of deps.pendingWatch()) if (dayKey(new Date(minute * 60_000)) === today) secs += s;
    return secs;
  }

  function watchedIn(minute: number) {
    const d = new Date(minute * 60_000);
    const day = dayKey(d) === dayKey() ? stats.today : stats.yesterday;
    return (day.watch[d.getHours() * 60 + d.getMinutes()] ?? 0) + (deps.pendingWatch().get(minute) ?? 0);
  }

  /** 30m: share of each minute spent watching (0–1). 24h: minutes watched per hour. Oldest first. */
  function series(): number[] {
    const nowMin = Math.floor(Date.now() / 60_000);
    if (range === '30m') {
      return Array.from({ length: 30 }, (_, i) => Math.min(1, watchedIn(nowMin - 29 + i) / 60));
    }
    const out: number[] = [];
    for (let h = 23; h >= 0; h--) {
      const hourEnd = nowMin - h * 60;
      let secs = 0;
      for (let m = hourEnd - 59; m <= hourEnd; m++) secs += watchedIn(m);
      out.push(secs / 60);
    }
    return out;
  }

  /* ---------- rendering ---------- */

  function renderAll() {
    renderStatus();
    renderToggles();
    for (const b of shadow.querySelectorAll<HTMLButtonElement>('.seg button')) {
      b.setAttribute('aria-pressed', String(b.dataset.range === range));
    }
    $('axis-start').textContent = range === '30m' ? '30 min ago' : '24 h ago';
    renderLive();
  }

  /** Every second while open. */
  function renderLive() {
    if (!open) return;
    $('video-title').textContent = deps.getVideoId()
      ? document.title.replace(/^\(\d+\)\s*/, '').replace(/\s*-\s*YouTube$/, '')
      : 'No video open';
    $('minutes').textContent = fmtDuration(todayWatchSeconds());
    $('lookups').textContent = String(stats.today.lookups);
    drawSpark(series());
    renderAlerts();
  }

  function renderStatus() {
    const pill = $('pill');
    const [state, text] =
      status.kind === 'idle' ? ['idle', 'No video'] :
      status.kind === 'waiting' ? ['working', 'Loading captions'] :
      status.kind === 'aligning' ? ['working', `Translating ${Math.round((status.done / Math.max(1, status.total)) * 100)}%`] :
      status.failed ? ['warn', 'Partly translated'] : ['ready', 'Ready'];
    pill.dataset.state = state;
    pill.textContent = text;
  }

  function renderToggles() {
    $('cc').setAttribute('aria-checked', String(deps.captionsOn()));
  }

  function drawSpark(vals: number[]) {
    const svg = $('spark') as unknown as SVGSVGElement;
    const w = svg.clientWidth || 300;
    const h = 48;
    const pad = 4;
    const max = Math.max(range === '30m' ? 1 : 15, ...vals);
    const step = w / (vals.length - 1);
    const pts = vals.map((v, i) => [i * step, h - pad - (v / max) * (h - pad * 2)] as const);
    const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
    const [lx, ly] = pts[pts.length - 1];
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.innerHTML =
      `<path class="spark-area" d="${d}L${w},${h}L0,${h}Z"/>` +
      `<path class="spark-line" d="${d}"/>` +
      `<circle class="spark-dot" cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="3"/>`;
    const minutes = range === '30m' ? vals.reduce((a, b) => a + b, 0) : vals.reduce((a, b) => a + b, 0);
    svg.setAttribute('aria-label', `${fmtDuration(minutes * 60)} watched in the last ${range === '30m' ? '30 minutes' : '24 hours'}`);
  }

  function computeAlert(): Alert | null {
    if (status.kind === 'idle') {
      return { key: 'idle', tone: 'info', text: 'Open a YouTube video with English captions to start practicing.' };
    }
    if (status.kind === 'waiting') {
      return { key: 'waiting', tone: 'info', text: 'Waiting for captions… If nothing appears, this video may not have English captions.' };
    }
    if (status.kind === 'ready' && status.failed) {
      return { key: 'failed', tone: 'warn', text: `${status.failed} caption batch${status.failed > 1 ? 'es' : ''} couldn't be translated. Those lines show English only.`, actions: [['Retry translation', deps.retry]] };
    }
    if (!deps.captionsOn()) {
      return { key: 'cc-off', tone: 'info', text: 'Bilingual captions are hidden.', actions: [['Show them', () => setCaptions(true)]] };
    }
    return null;
  }

  /** Rebuild the card only when its identity changes, so its buttons keep focus between ticks. */
  function renderAlerts() {
    const a = computeAlert();
    const box = $('alerts');
    const key = a?.key ?? '';
    if (key !== alertKey) {
      alertKey = key;
      box.replaceChildren();
      if (a) {
        const card = document.createElement('div');
        card.className = 'alert';
        card.dataset.tone = a.tone;
        const msg = document.createElement('div');
        msg.className = 'msg';
        card.append(msg);
        if (a.actions?.length) {
          const btns = document.createElement('div');
          btns.className = 'btns';
          for (const [label, fn] of a.actions) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'btn small';
            b.textContent = label;
            b.addEventListener('click', fn);
            btns.append(b);
          }
          card.append(btns);
        }
        box.append(card);
      }
    }
    const msg = box.querySelector('.msg');
    if (a && msg) msg.textContent = a.text;
  }

  /* ---------- actions ---------- */

  function setCaptions(on: boolean) {
    deps.setCaptionsOn(on);
    renderToggles();
    renderAlerts();
  }

  function openDashboard() {
    const ctx = { videoId: deps.getVideoId(), t: deps.getVideo()?.currentTime, range: range === '30m' ? '1h' : '24h' };
    try {
      chrome.runtime.sendMessage({ type: 'll:open-dashboard', ctx }).catch(() => {});
    } catch { /* orphaned */ }
  }

  function wire() {
    for (const b of shadow.querySelectorAll('.close-panel')) b.addEventListener('click', () => toggle(false));
    for (const b of shadow.querySelectorAll('.collapse-panel')) b.addEventListener('click', () => setCollapsed(true));
    $('bubble').addEventListener('click', () => setCollapsed(false));
    for (const b of shadow.querySelectorAll('.dash-link')) b.addEventListener('click', openDashboard);
    $('brand-link').addEventListener('click', openDashboard);
    for (const a of shadow.querySelectorAll('[data-todo]')) a.addEventListener('click', (e) => e.preventDefault());
    $('signin').addEventListener('click', signIn);
    for (const b of shadow.querySelectorAll('.sign-out')) b.addEventListener('click', signOut);
    $('lookup-back').addEventListener('click', () => {
      lookupOpen = false;
      renderView();
      deps.onLookupBack?.();
    });
    $('panel').addEventListener('keydown', (e) => { if (e.key === 'Escape') toggle(false); });
    $('cc').addEventListener('click', () => setCaptions(!deps.captionsOn()));
    for (const b of shadow.querySelectorAll<HTMLButtonElement>('.seg button')) {
      b.addEventListener('click', () => { range = b.dataset.range as '30m' | '24h'; renderAll(); });
    }
    // Keep the panel visible in fullscreen by moving it into the fullscreen element.
    document.addEventListener('fullscreenchange', () => {
      if (host.isConnected) (document.fullscreenElement ?? document.body).append(host);
    });
  }

  async function signIn() {
    const revision = ++authRevision;
    const button = $('signin') as HTMLButtonElement;
    const error = $('signin-error');
    button.disabled = true;
    error.hidden = true;
    try {
      const r = await chrome.runtime.sendMessage({ type: 'signin' });
      if (!r?.ok) throw new Error(r?.error ?? 'Sign-in failed.');
      if (revision === authRevision) { signedIn = true; renderView(); }
    } catch (e) {
      error.textContent = e instanceof Error ? e.message : String(e);
      error.hidden = false;
    } finally {
      button.disabled = false;
    }
  }

  async function signOut() {
    authRevision++;
    showSignIn();
    try {
      // Also clear locally if an extension reload disconnected the worker.
      await chrome.storage.local.remove([SESSION_KEY, 'll:signedIn']);
      const result = await chrome.runtime.sendMessage({ type: 'signout' });
      if (!result?.ok) throw new Error(result?.error ?? 'Sign-out failed.');
    } catch (error) {
      $('signin-error').textContent = 'Sign-out cleanup failed. Reload the YouTube tab and try again.';
      $('signin-error').hidden = false;
      console.warn('[LL panel] Sign-out cleanup failed.', error);
    }
  }

  function showSignIn() {
    signedIn = false;
    lookupOpen = false;
    deps.onLookupBack?.();
    renderView();
    if (open) $('signin').focus({ preventScroll: true });
  }

  function setCollapsed(next: boolean) {
    collapsed = next;
    host.classList.toggle('collapsed', next);
    $('panel').hidden = next;
    $('bubble').hidden = !next;
    if (open) $(next ? 'bubble' : 'panel').focus({ preventScroll: true });
  }

  function toggle(force?: boolean) {
    // While collapsed, the extension icon (or a word lookup) expands rather than closes.
    if (open && collapsed && force !== false) { setCollapsed(false); return; }
    open = force ?? !open;
    if (open) {
      if (!host.isConnected) (document.fullscreenElement ?? document.body).append(host);
      host.style.display = '';
      void loadStats().then(renderAll);
      renderAll();
      clearInterval(timer);
      timer = window.setInterval(renderLive, 1000);
      $('panel').focus({ preventScroll: true });
    } else {
      host.style.display = 'none';
      setCollapsed(false);
      clearInterval(timer);
      deps.onClose?.();
    }
  }

  return {
    toggle,
    practice: {
      el: $('practice'),
      show(title = 'Word lookup') {
        $('lookup-title').textContent = title;
        lookupOpen = true;
        renderView();
        if (!open || collapsed) toggle(true);
        $('panel').scrollTop = 0;
      },
      hide() { lookupOpen = false; renderView(); },
    },
    setStatus(next) {
      status = next;
      if (open) { renderStatus(); renderAlerts(); }
    },
    reset() {
      if (open) renderAll();
    },
  };
}

function fmtDuration(sec: number) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m`;
  return `${sec}s`;
}
