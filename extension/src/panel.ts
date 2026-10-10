// The glanceable panel opened from the extension icon. Injected into the YouTube page inside a
// shadow root (per spec: an injected panel, not Chrome's side panel API), so it can read the
// current caption line and the video directly.
import { PALETTE, renderColored } from './colorize';
import { getVocab, logEvent, sameVocab, toggleVocab, VOCAB_KEY, type VocabItem } from './events';
import { PANEL_CSS } from './panel-css';
import { dayKey, emptyDay, isStatsKey, readRecent, type DayStats } from './stats';
import type { AlignedLine, Pair } from './types';

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
};

export type PanelController = {
  toggle(force?: boolean): void;
  setLine(line: AlignedLine | null): void;
  setStatus(status: PanelStatus): void;
  reset(): void;
};

type Alert = { key: string; tone: 'info' | 'warn' | 'suggest'; text: string; actions?: [string, () => void][] };

// Static markup only. Every dynamic string goes in through textContent.
const HTML = `
<aside class="panel" id="panel" role="complementary" aria-label="Learning panel" tabindex="-1">
  <header>
    <div class="logo" aria-hidden="true">LL</div>
    <div class="titles">
      <div class="name" id="name"></div>
      <div class="video-title" id="video-title"></div>
    </div>
    <span class="pill" id="pill" role="status"></span>
    <button type="button" class="icon" id="close" aria-label="Close panel">×</button>
  </header>

  <section id="alerts" aria-live="polite"></section>

  <section class="stats">
    <div class="card"><div class="label">Practice today</div><div class="value" id="minutes">0m</div></div>
    <div class="card"><div class="label">Lookups today</div><div class="value" id="lookups">0</div></div>
  </section>

  <section class="line" id="line-card" hidden>
    <div class="line-head"><span class="label" id="line-label">Now</span><span class="time" id="line-time"></span></div>
    <div class="tgt" id="line-tgt" lang="es"></div>
    <div class="src" id="line-src" lang="en"></div>
    <div class="chips" id="chips" aria-label="Phrase pairs"></div>
    <div class="note" id="note" hidden></div>
    <div class="line-actions">
      <button type="button" class="btn ghost" id="replay">↺ Replay</button>
      <button type="button" class="btn ghost" id="save" aria-pressed="false">☆ Save line</button>
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

  <footer><button type="button" class="btn primary" id="dash">Open dashboard →</button></footer>
</aside>`;

export function createPanel(deps: PanelDeps): PanelController {
  const host = document.createElement('div');
  host.id = 'll-panel-host';
  host.style.display = 'none';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `<style>${PANEL_CSS}</style>${HTML}`;
  const $ = (id: string) => shadow.getElementById(id) as HTMLElement;

  let open = false;
  let status: PanelStatus = { kind: 'idle' };
  let line: AlignedLine | null = null;
  let lineIsCurrent = false;
  let selected = -1;
  let range: '30m' | '24h' = '30m';
  let stats: { today: DayStats; yesterday: DayStats } = { today: emptyDay(), yesterday: emptyDay() };
  let vocab: VocabItem[] = [];
  let timer = 0;
  let alertKey: string | null = null;
  const replays = new Map<string, number>();
  const dismissed = new Set<string>();
  const lookedUp = new Set<string>();

  $('name').textContent = chrome.runtime.getManifest().name;
  wire();

  /* ---------- data ---------- */

  const lineKey = (l: AlignedLine) => `${deps.getVideoId()}|${l.start}`;

  async function loadStats() {
    try { stats = await readRecent(); } catch { /* orphaned after extension reload */ }
  }
  async function loadVocab() {
    try { vocab = await getVocab(); } catch { /* orphaned */ }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !open) return;
    const keys = Object.keys(changes);
    if (keys.some(isStatsKey)) void loadStats().then(renderLive);
    if (keys.includes(VOCAB_KEY)) void loadVocab().then(() => { renderSave(); renderAlerts(); });
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
    renderLine();
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
    host.dataset.theme = document.documentElement.hasAttribute('dark') ? 'dark' : 'light';
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

  function renderLine() {
    $('line-card').hidden = !line;
    if (!line) return;
    const l = line;
    $('line-label').textContent = lineIsCurrent ? 'Now' : 'Last line';
    $('line-time').textContent = fmtClock(l.start);

    const tgt = $('line-tgt');
    tgt.classList.toggle('pending', !l.tgt);
    tgt.replaceChildren(l.tgt ? renderColored(l.tgt, l.pairs.map((p) => p.tgt)) : 'Translating…');
    $('line-src').replaceChildren(renderColored(l.src, l.pairs.map((p) => p.src)));

    const chips = $('chips');
    chips.replaceChildren();
    l.pairs.forEach((p, i) => {
      if (!p.tgt) return;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.style.setProperty('--c', PALETTE[i % PALETTE.length]);
      b.textContent = p.tgt;
      b.title = p.note ? `${p.src} · ${p.note}` : p.src;
      b.setAttribute('aria-pressed', String(i === selected));
      b.addEventListener('click', () => selectPair(i));
      chips.append(b);
    });
    chips.hidden = !l.tgt || !chips.childElementCount;
    renderNote();
    renderSave();
  }

  function renderNote() {
    const note = $('note');
    const pair: Pair | undefined = line?.pairs[selected];
    note.hidden = !pair;
    if (!pair) return;
    const gloss = document.createElement('div');
    gloss.className = 'gloss';
    const word = document.createElement('span');
    word.style.color = PALETTE[selected % PALETTE.length];
    word.textContent = pair.tgt;
    gloss.append(word, ` = ${pair.src}`);
    const detail = document.createElement('div');
    detail.className = 'detail';
    detail.textContent = pair.note || 'No grammar note for this pair yet.';
    note.replaceChildren(gloss, detail);
  }

  function saveTarget(kind: 'auto' | 'line' = 'auto'): Omit<VocabItem, 'saved_at'> | null {
    if (!line) return null;
    const pair = kind === 'auto' ? line.pairs[selected] : undefined;
    return pair
      ? { word: pair.tgt || pair.src, translation: pair.src, video_id: deps.getVideoId(), video_ts: line.start }
      : { word: line.tgt || line.src, translation: line.src, video_id: deps.getVideoId(), video_ts: line.start };
  }

  const isSaved = (item: Omit<VocabItem, 'saved_at'> | null) => !!item && vocab.some((v) => sameVocab(v, item));

  function renderSave() {
    const btn = $('save');
    const saved = isSaved(saveTarget());
    const what = line?.pairs[selected] ? 'phrase' : 'line';
    btn.textContent = saved ? `★ Saved` : `☆ Save ${what}`;
    btn.setAttribute('aria-pressed', String(saved));
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
      return { key: 'failed', tone: 'warn', text: `${status.failed} caption batch${status.failed > 1 ? 'es' : ''} couldn't be translated. Those lines show English only.` };
    }
    if (!deps.captionsOn()) {
      return { key: 'cc-off', tone: 'info', text: 'Bilingual captions are hidden.', actions: [['Show them', () => setCaptions(true)]] };
    }
    if (line) {
      const k = lineKey(line);
      const n = replays.get(k) ?? 0;
      if (n >= 3 && !dismissed.has(k) && !isSaved(saveTarget('line'))) {
        return {
          key: `replay:${k}`,
          tone: 'suggest',
          text: `You've replayed this line ${n} times. Save it to review later?`,
          actions: [
            ['Save line', () => void save('line')],
            ['Not now', () => { dismissed.add(k); renderAlerts(); }],
          ],
        };
      }
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

  function selectPair(i: number) {
    if (!line) return;
    selected = selected === i ? -1 : i;
    const pair = line.pairs[selected];
    if (pair) {
      const k = `${lineKey(line)}|${i}`;
      if (!lookedUp.has(k)) {
        lookedUp.add(k);
        logEvent({
          event_type: 'lookup', video_id: deps.getVideoId(), word: pair.tgt, lang: 'es',
          meta: { src: pair.src, note: pair.note ?? null, line: line.tgt, video_ts: line.start, from: 'panel' },
        });
      }
    }
    renderLine();
  }

  async function save(kind: 'auto' | 'line' = 'auto') {
    const item = saveTarget(kind);
    if (!item) return;
    await toggleVocab(item);
    await loadVocab();
    renderSave();
    renderAlerts();
  }

  function replay() {
    const video = deps.getVideo();
    if (!video || !line) return;
    video.currentTime = line.start;
    void video.play().catch(() => {});
    const k = lineKey(line);
    replays.set(k, (replays.get(k) ?? 0) + 1);
    renderAlerts();
  }

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
    $('close').addEventListener('click', () => toggle(false));
    $('panel').addEventListener('keydown', (e) => { if (e.key === 'Escape') toggle(false); });
    $('replay').addEventListener('click', replay);
    $('save').addEventListener('click', () => void save());
    $('cc').addEventListener('click', () => setCaptions(!deps.captionsOn()));
    $('dash').addEventListener('click', openDashboard);
    for (const b of shadow.querySelectorAll<HTMLButtonElement>('.seg button')) {
      b.addEventListener('click', () => { range = b.dataset.range as '30m' | '24h'; renderAll(); });
    }
    // Colored words in the line are clickable too, same as the chips.
    for (const id of ['line-tgt', 'line-src']) {
      $(id).addEventListener('click', (e) => {
        const span = (e.target as Element).closest?.('[data-pair-index]') as HTMLElement | null;
        if (span) selectPair(Number(span.dataset.pairIndex));
      });
    }
    // Keep the panel visible in fullscreen by moving it into the fullscreen element.
    document.addEventListener('fullscreenchange', () => {
      if (host.isConnected) (document.fullscreenElement ?? document.body).append(host);
    });
  }

  function toggle(force?: boolean) {
    open = force ?? !open;
    if (open) {
      if (!host.isConnected) (document.fullscreenElement ?? document.body).append(host);
      host.style.display = '';
      void Promise.all([loadStats(), loadVocab()]).then(renderAll);
      renderAll();
      clearInterval(timer);
      timer = window.setInterval(renderLive, 1000);
      $('panel').focus({ preventScroll: true });
    } else {
      host.style.display = 'none';
      clearInterval(timer);
    }
  }

  return {
    toggle,
    setLine(next) {
      if (next) {
        if (!line || lineKey(next) !== lineKey(line)) selected = -1;
        line = next;
        lineIsCurrent = true;
      } else {
        lineIsCurrent = false; // keep showing the last line so it can still be saved or replayed
      }
      if (open) { renderLine(); renderAlerts(); }
    },
    setStatus(next) {
      status = next;
      if (open) { renderStatus(); renderAlerts(); }
    },
    reset() {
      line = null;
      lineIsCurrent = false;
      selected = -1;
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

function fmtClock(sec: number) {
  sec = Math.max(0, Math.floor(sec));
  const m = Math.floor(sec / 60);
  return `${m}:${String(sec % 60).padStart(2, '0')}`;
}
