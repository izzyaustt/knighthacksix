// The glanceable panel opened from the extension icon. Injected into the YouTube page inside a
// shadow root (per spec: an injected panel, not Chrome's side panel API), so it can drive the
// video directly. Captions stay on the video; the panel shows a lookup only once a word is picked
// (practice.ts renders into the lookup view).
import { LANGUAGES, isLanguage } from '../../shared/languages';
import { getSettings } from './settings';
import LOGO_FULL from './assets/logo-full.png?inline';
import LOGO_MARK from './assets/logo-mark.png?inline';
import MASCOT from './assets/mascot.svg?inline';
import { PANEL_CSS } from './panel-css';

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
    <div class="titles"></div>
    <button type="button" class="icon sign-out" aria-label="Sign out" title="Sign out"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3"></path><path d="M10 16l-4-4 4-4M6 12h10"></path></svg></button>
    <button type="button" class="icon collapse-panel" aria-label="Collapse panel" title="Collapse"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 17l5-5-5-5M6 17l5-5-5-5"></path></svg></button>
  </header>

  <div class="empty">
    <img class="mascot" src="${MASCOT}" alt="" width="155" height="138">
    <p class="empty-text">you currently have no word(s) selected.</p>
    <p class="empty-text">click one to begin!</p>
    <section id="alerts" aria-live="polite"></section>
  </div>

  <section class="mini-settings">
    <label class="row" for="learning-language">Learning language <select id="learning-language" aria-label="Learning language"></select></label>
    <p id="language-note" hidden>Tagalog is in preview. Double-check caption translations and word meanings.</p>
    <div class="row">
      <span id="cc-label">Bilingual captions</span>
      <button type="button" class="switch" id="cc" role="switch" aria-checked="true" aria-labelledby="cc-label"><span></span></button>
    </div>
  </section>

  <footer><button type="button" class="dash-link">Open dashboard <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5"></path></svg></button></footer>
 </div>

 <div class="view tour" id="view-tour" hidden>
  <header>
    <div class="titles"><img class="tour-logo" src="${LOGO_FULL}" alt="langtube"></div>
    <button type="button" class="icon sign-out" aria-label="Sign out" title="Sign out"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3"></path><path d="M10 16l-4-4 4-4M6 12h10"></path></svg></button>
    <button type="button" class="icon collapse-panel" aria-label="Collapse panel" title="Collapse"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 17l5-5-5-5M6 17l5-5-5-5"></path></svg></button>
  </header>
  <h1 class="tour-title">Learn from videos you already love.</h1>
  <p class="tour-sub">Five simple steps to turn watching into speaking.</p>
  <div class="tour-visual" id="tour-visual"></div>
  <div class="tour-callout" role="status">
    <span class="tour-count" id="tour-count"></span>
    <h2 id="tour-heading"></h2>
    <p id="tour-text"></p>
  </div>
  <div class="tour-dots" id="tour-dots" aria-hidden="true"></div>
  <div class="tour-nav">
    <div class="tour-links"><button type="button" class="tour-back" id="tour-back">Back</button><button type="button" class="tour-skip" id="tour-skip">Skip tour</button></div>
    <button type="button" class="tour-next" id="tour-next"></button>
  </div>
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

// First-run tutorial. Static markup only: nothing here comes from the page or the network.
const heat = Array.from({ length: 48 }, (_, i) => `<s class="h${(i * 7 + (i % 5)) % 4}"></s>`).join('');
const TOUR_STEPS: { title: string; text: string; visual: string }[] = [
  {
    title: 'Go to any YouTube video',
    text: 'Open a video you want to understand. Langtube will add interactive captions as it plays.',
    visual: `<div class="t-video"><div class="t-video-title">How to cook a quick Spanish dinner</div><div class="t-video-bar"><span class="t-play"></span><span class="t-track"><i></i></span><span class="t-time">0:18 / 8:42</span></div></div>
      <div class="t-meta"><strong>Learn Spanish while you cook</strong><span>Cocina Fácil · 248K views</span></div>`,
  },
  {
    title: 'Click a colored word',
    text: 'Choose any highlighted word in the pop-up caption to pause the video and take a closer look.',
    visual: `<div class="t-stage"><div class="t-caption">Hoy vamos a <mark class="c1">cocinar</mark> algo <mark class="c2">delicioso</mark></div></div>
      <div class="t-hint">↑ Tap a colored word</div>`,
  },
  {
    title: 'See it, hear it, say it',
    text: 'View the translation and pronunciation, then practice pronouncing the word out loud.',
    visual: `<div class="t-word"><span class="t-eyebrow">SPANISH</span><span class="t-big">cocinar</span><span class="t-pron">koh-see-NAR</span><div class="t-rule"></div><div class="t-row"><strong>to cook</strong><span>verb</span></div>
      <span class="t-speaker"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5L6 9H3v6h3l5 4z"></path><path d="M15.5 8.5a5 5 0 010 7M18.5 5.5a9 9 0 010 13"></path></svg></span></div><div class="t-bar"></div>`,
  },
  {
    title: 'Save words for later',
    text: 'Save useful words with one click so you can come back and practice them anytime.',
    visual: `<div class="t-save"><div class="t-save-card"><div><strong class="t-big sm">cocinar</strong><span>to cook</span></div>
      <span class="t-bookmark"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z"></path></svg></span></div>
      <div class="t-saved"><span class="t-check">✓</span> Saved to your word list</div></div>`,
  },
  {
    title: 'Visit your dashboard',
    text: 'See your language stats, review saved words, and open all of your study tools in one place.',
    visual: `<div class="t-dash"><div class="t-dash-side"><i class="on">Dashboard</i><i>Study</i></div>
      <div class="t-dash-main"><div class="t-dash-head">Overview</div><div class="t-dash-grid">${heat}</div><div class="t-dash-olive">Mastery Levels</div></div></div>`,
  },
];

const SESSION_KEY = 'session'; // written by auth.ts in the service worker
const TOUR_KEY = 'll:tourDone';
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
  const TAGALOG_NOTE = 'Tagalog is in preview. Double-check caption translations and word meanings.';
  const showLanguageNote = () => { $('language-note').textContent = TAGALOG_NOTE; $('language-note').hidden = languageSelect.value !== 'fil'; };
  void getSettings().then(settings => { languageSelect.value = settings.langTgt; showLanguageNote(); });
  languageSelect.addEventListener('change', async () => {
    languageSelect.disabled = true;
    try {
      const settings = await getSettings();
      await chrome.storage.local.set({ settings: { ...settings, langTgt: languageSelect.value } });
      showLanguageNote();
    } catch { $('language-note').textContent = 'Could not change language. Try again.'; $('language-note').hidden = false; }
    finally { languageSelect.disabled = false; }
  });

  let open = false;
  let collapsed = false; // open, but shrunk to the logo bubble
  let layoutObserver: ResizeObserver | null = null;
  // Cover the recommendation column, including YouTube's outer right margin.
  // In theater/fullscreen layouts that column is below the player: keep the normal width.
  function fitToRecommendations() {
    if (!open) return;
    const viewport = document.documentElement.clientWidth;
    const secondary = document.querySelector<HTMLElement>('ytd-watch-flexy #secondary');
    const player = document.querySelector<HTMLElement>('#movie_player');
    const column = secondary?.getBoundingClientRect();
    const video = player?.getBoundingClientRect();
    const alongside = column && video && column.width > 0 && column.left >= viewport / 2 && column.left >= video.right - 2;
    const left = alongside ? Math.max(video.right, column.left - 8) : viewport - 400;
    host.style.setProperty('--ll-panel-width', `${Math.min(viewport, Math.max(320, viewport - left))}px`);
  }
  function observeLayout() {
    layoutObserver?.disconnect();
    if (typeof ResizeObserver === 'undefined') return;
    layoutObserver = new ResizeObserver(fitToRecommendations);
    for (const target of document.querySelectorAll('ytd-watch-flexy #secondary, #movie_player')) layoutObserver.observe(target);
  }
  document.defaultView?.addEventListener('resize', fitToRecommendations);
  document.addEventListener('yt-navigate-finish', () => { if (open) { observeLayout(); fitToRecommendations(); } });
  let status: PanelStatus = { kind: 'idle' };
  let alertKey: string | null = null;

  // The service worker owns the Google session (auth.ts); the panel only asks and listens for changes.
  let signedIn = false;
  let lookupOpen = false;
  let tourDone = true; // flipped to false below if this is a first run
  let tourStep = 0;
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

  try {
    void chrome.storage.local.get(TOUR_KEY).then((got) => { tourDone = !!got[TOUR_KEY]; renderView(); }).catch(() => {});
  } catch { /* orphaned after extension reload */ }

  wire();
  renderView();

  function renderView() {
    const view = !signedIn ? 'signin' : lookupOpen ? 'lookup' : !tourDone ? 'tour' : 'home';
    for (const name of ['signin', 'home', 'tour', 'lookup']) $(`view-${name}`).hidden = name !== view;
    if (view === 'tour') renderTour();
  }

  /* ---------- first-run tour ---------- */

  function renderTour() {
    const step = TOUR_STEPS[tourStep];
    const last = tourStep === TOUR_STEPS.length - 1;
    $('tour-visual').innerHTML = step.visual;
    $('tour-count').textContent = `${tourStep + 1} OF ${TOUR_STEPS.length}`;
    $('tour-heading').textContent = step.title;
    $('tour-text').textContent = step.text;
    $('tour-dots').replaceChildren(...TOUR_STEPS.map((_, i) => {
      const dot = document.createElement('span');
      if (i === tourStep) dot.className = 'on';
      return dot;
    }));
    $('tour-back').hidden = tourStep === 0;
    $('tour-skip').hidden = last;
    const next = $('tour-next');
    next.textContent = last ? 'Get started ' : 'Next ';
    next.insertAdjacentHTML('beforeend', '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"></path></svg>');
  }

  function finishTour() {
    tourDone = true;
    tourStep = 0;
    renderView();
    try { void chrome.storage.local.set({ [TOUR_KEY]: true }); } catch { /* orphaned */ }
  }

  /* ---------- data ---------- */

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    const nextLanguage = (changes.settings?.newValue as { langTgt?: unknown } | undefined)?.langTgt;
    if (isLanguage(nextLanguage)) { languageSelect.value = nextLanguage; showLanguageNote(); }
    if (TOUR_KEY in changes) { tourDone = !!changes[TOUR_KEY].newValue; renderView(); }
    // Signed in from another tab, signed out, or the backend rejected an expired session.
    if (SESSION_KEY in changes) {
      authRevision++;
      if (!changes[SESSION_KEY].newValue) showSignIn();
      else { signedIn = true; renderView(); }
    }
  });

  /* ---------- rendering ---------- */

  function renderAll() {
    renderToggles();
    renderAlerts();
  }

  function renderToggles() {
    $('cc').setAttribute('aria-checked', String(deps.captionsOn()));
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
    const ctx = { videoId: deps.getVideoId(), t: deps.getVideo()?.currentTime, range: '1h' as const };
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
    $('tour-back').addEventListener('click', () => { tourStep = Math.max(0, tourStep - 1); renderTour(); });
    $('tour-skip').addEventListener('click', () => finishTour());
    $('tour-next').addEventListener('click', () => {
      if (tourStep < TOUR_STEPS.length - 1) { tourStep++; renderTour(); } else finishTour();
    });
    for (const b of shadow.querySelectorAll('.sign-out')) b.addEventListener('click', signOut);
    $('lookup-back').addEventListener('click', () => {
      lookupOpen = false;
      renderView();
      deps.onLookupBack?.();
    });
    $('panel').addEventListener('keydown', (e) => { if (e.key === 'Escape') toggle(false); });
    $('cc').addEventListener('click', () => setCaptions(!deps.captionsOn()));
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
      if (revision === authRevision) { signedIn = true; tourDone = false; tourStep = 0; renderView(); }
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
    // Demo behavior: the tutorial plays again after every sign-in.
    tourDone = false;
    tourStep = 0;
    try { void chrome.storage.local.remove(TOUR_KEY); } catch { /* orphaned */ }
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
      fitToRecommendations();
      observeLayout();
      renderAll();
      $('panel').focus({ preventScroll: true });
    } else {
      host.style.display = 'none';
      layoutObserver?.disconnect();
      setCollapsed(false);
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
      if (open) renderAlerts();
    },
    reset() {
      if (open) renderAll();
    },
  };
}