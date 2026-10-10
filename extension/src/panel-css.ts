// Lives inside the panel's shadow root, so nothing here leaks into YouTube (or vice versa).
export const PANEL_CSS = `
:host {
  all: initial;
  position: fixed; top: 0; right: 0; bottom: 0; z-index: 2300;
  width: 400px; max-width: 100vw; height: 100vh; height: 100dvh;
  font-family: Figtree, system-ui, sans-serif;
  /* Langtube palette */
  --sand: #EDE1D6; --ink: #3A2C35; --ink-soft: #4E4048; --olive: #5E6128; --pink: #F2C6C7; --wine: #8A3F48;
  --bg: var(--sand); --surface: #ffffff; --border: rgba(58, 44, 53, .16); --text: var(--ink); --muted: var(--ink-soft);
  --accent: var(--olive); --on-accent: #ffffff; --accent-soft: rgba(94, 97, 40, .16);
  --ok: var(--olive); --warn: var(--wine); --danger: var(--wine);
  color-scheme: light;
}
* { box-sizing: border-box; }
[hidden] { display: none !important; }
button { font: inherit; }
a { color: var(--ink); } a:hover { color: var(--olive); }
:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }

.panel {
  width: 100%; height: 100%; overflow-y: auto; overscroll-behavior: contain;
  display: flex; flex-direction: column;
  background: var(--bg); color: var(--text);
  border-left: 1px solid var(--border);
  box-shadow: -8px 0 28px rgba(0, 0, 0, .22);
  font-size: 14px; line-height: 1.4; outline: none;
}
/* Narrow windows: the panel becomes the whole width; short ones: tighter padding. */
@media (max-width: 520px) { :host { width: 100vw; } .panel { border-left: 0; } }
@media (max-height: 640px) {
  .view.lookup { gap: 14px; padding-top: 10px; }
  .view.signin { gap: 24px; padding: 24px; }
  .word { font-size: 40px; }
}
.view { display: flex; flex-direction: column; flex: 1 0 auto; }
.view > footer { margin-top: auto; }
.eyebrow { font-size: 13px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; margin: 0; }

/* Sign in */
.view.signin { align-items: center; justify-content: center; gap: 40px; padding: 48px 32px; }
.brand { display: flex; flex-direction: column; align-items: center; gap: 12px; }
.wordmark { display: block; width: 300px; max-width: 100%; height: auto; }
.tagline { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -.01em; text-align: center; }
.pitch { margin: 0; font-size: 16px; line-height: 1.5; text-align: center; color: var(--ink-soft); max-width: 300px; }
.signin-actions { display: flex; flex-direction: column; align-items: center; gap: 16px; width: 100%; }
.google {
  width: 100%; max-width: 320px; height: 52px; display: flex; align-items: center; justify-content: center; gap: 12px;
  background: #fff; border: 1px solid #747775; border-radius: 26px; font-size: 16px; font-weight: 600; color: #1F1F1F; cursor: pointer;
}
.google:hover { background: #f7f7f7; }
.google:disabled { opacity: .6; cursor: progress; }
.signin-error { margin: 0; color: var(--danger); font-size: 14px; text-align: center; }
.legal { margin: 0; font-size: 13px; color: var(--ink-soft); text-align: center; }

/* Word lookup */
.view.lookup { gap: 20px; padding: 20px 20px 28px; }
.topbar { display: flex; align-items: center; justify-content: space-between; }
.topbar .eyebrow { font-weight: 600; color: var(--ink-soft); }
.topbar .icon { width: 44px; height: 44px; }
.lookup-body { display: flex; flex-direction: column; gap: 20px; }
.hero { display: flex; flex-direction: column; gap: 6px; padding: 0 4px; }
.word-row { display: flex; align-items: center; gap: 12px; }
.word { margin: 0; min-width: 0; font-size: 52px; font-weight: 800; letter-spacing: -.02em; line-height: 1; overflow-wrap: anywhere; }
.word.medium { font-size: 34px; line-height: 1.1; }
.word.long { font-size: 24px; line-height: 1.2; letter-spacing: -.01em; }
.round {
  flex: none; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center;
  border: none; border-radius: 50%; background: var(--olive); color: #fff; cursor: pointer;
}
.round.soft { background: var(--pink); color: var(--ink); }
.round:hover, .pill-btn:hover, .mic:hover { filter: brightness(1.07); }
.hero .gloss { margin: 0; font-size: 22px; font-weight: 700; color: var(--wine); }
.hero .grammar { margin: 0; font-size: 15px; color: var(--ink-soft); }
.hero .pron { margin: 4px 0 0; font-size: 16px; font-weight: 700; color: var(--olive); }
.hero .pron-hint { margin: 0; font-size: 13px; line-height: 1.4; color: var(--ink-soft); }
.hero-btns { display: flex; gap: 8px; margin-top: 6px; }
.hero-btns .pill-btn { flex: none; padding: 0 16px; }
.pill-btn:disabled, .round:disabled, .mic:disabled { opacity: .5; cursor: wait; }
.status { margin: 0; font-size: 13px; color: var(--ink-soft); }
.status:empty { display: none; }

.clip { background: var(--olive); color: #fff; border-radius: 24px; padding: 20px; display: flex; flex-direction: column; gap: 16px; }
.clip-head { display: flex; justify-content: space-between; align-items: baseline; }
.clip-head span { font-size: 13px; font-weight: 500; font-variant-numeric: tabular-nums; }
.clip-lines, .clip-block { display: flex; flex-direction: column; gap: 6px; }
.clip-tgt-row { display: flex; align-items: flex-start; gap: 10px; }
.clip-tgt { margin: 0; flex: 1; font-size: 21px; font-weight: 700; line-height: 1.35; }
.clip-src { margin: 0; font-size: 16px; line-height: 1.4; }
.clip mark { background: var(--pink); color: var(--ink); border-radius: 6px; padding: 0 5px; }
.clip .rule { height: 1px; background: rgba(255, 255, 255, .3); }
.clip-block p { margin: 0; font-size: 15px; line-height: 1.5; white-space: pre-wrap; }
.clip .status { color: #fff; }
.pair-btns { display: flex; gap: 12px; }
.pill-btn {
  flex: 1; height: 48px; display: flex; align-items: center; justify-content: center; gap: 8px;
  border: 2px solid var(--pink); border-radius: 24px; background: var(--pink); color: var(--ink);
  font-size: 15px; font-weight: 700; cursor: pointer;
}
.pill-btn[aria-pressed="true"] { background: transparent; color: #fff; }
.pill-btn.sm { height: 44px; font-size: 14px; border-color: var(--ink); background: transparent; }
.pill-btn.sm.dark { background: var(--ink); color: #fff; }
.clip .pill-btn.more { flex: none; border-color: #fff; background: transparent; color: #fff; }

.say { background: #fff; border-radius: 24px; padding: 20px; display: flex; flex-direction: column; gap: 16px; }
.say-row { display: flex; align-items: center; gap: 16px; }
.mic {
  flex: none; width: 72px; height: 72px; display: flex; align-items: center; justify-content: center;
  border: none; border-radius: 50%; background: var(--wine); color: #fff; cursor: pointer;
}
.mic[aria-pressed="true"] { box-shadow: 0 0 0 6px rgba(138, 63, 72, .25); }
.say-text { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.say-word { margin: 0; font-size: 26px; font-weight: 700; letter-spacing: .02em; overflow-wrap: anywhere; }
.say-word.long { font-size: 17px; letter-spacing: 0; }
.say-hint { margin: 0; font-size: 14px; color: var(--ink-soft); }
.attempt { background: var(--sand); border-radius: 16px; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.attempt-head { display: flex; align-items: baseline; justify-content: space-between; font-size: 15px; font-weight: 600; }
.attempt-head .score { font-size: 28px; font-weight: 800; color: var(--olive); }
.word-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.word-chips span { flex: 1 1 auto; text-align: center; padding: 8px 10px; border-radius: 10px; font-weight: 700; font-size: 16px; background: var(--pink); color: var(--ink); }
.word-chips span[data-status="correct"] { background: var(--olive); color: #fff; }
.attempt p { margin: 0; font-size: 14px; line-height: 1.45; }

footer { display: flex; justify-content: center; }
.dash-link {
  display: inline-flex; align-items: center; gap: 6px; min-height: 44px; padding: 0 8px;
  border: 0; background: none; color: var(--ink); font-size: 16px; font-weight: 600; text-decoration: underline; cursor: pointer;
}
.dash-link:hover { color: var(--olive); }

/* Header */
header { display: flex; align-items: center; gap: 10px; padding: 0 0 0 4px; }
.logo { display: block; flex: none; width: 34px; height: 40px; }
.logo.small { width: 26px; height: 30px; }
.top-actions { display: flex; align-items: center; }
.topbar-title { display: flex; align-items: center; gap: 8px; }
.titles { min-width: 0; flex: 1; }
.name { font-family: Caveat, cursive; font-weight: 600; font-size: 30px; line-height: 1; color: var(--olive); }
.video-title { font-size: 14px; font-weight: 500; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pill {
  flex: none; font-size: 13px; font-weight: 600; padding: 6px 12px; border-radius: 999px; white-space: nowrap;
  background: var(--surface); color: var(--ink);
  display: inline-flex; align-items: center; gap: 6px;
}
.pill::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--muted); }
.pill[data-state="working"]::before { background: var(--accent); animation: pulse 1.4s ease-in-out infinite; }
.pill[data-state="ready"]::before { background: var(--ok); }
.pill[data-state="warn"]::before { background: var(--warn); }
@keyframes pulse { 50% { opacity: .25; } }
@media (prefers-reduced-motion: reduce) { .pill::before { animation: none !important; } }
.icon {
  flex: none; width: 44px; height: 44px; border: 0; border-radius: 50%; padding: 0;
  display: flex; align-items: center; justify-content: center;
  background: none; color: var(--ink); cursor: pointer;
}
.icon:hover { background: rgba(58, 44, 53, .08); }

/* Cards + numbers */
.view.home { gap: 14px; padding: 16px 16px 20px; }
.card { background: var(--surface); border-radius: 24px; padding: 18px 20px; }
.label { font-size: 13px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--ink); }
.stats { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.value { font-size: 34px; font-weight: 800; letter-spacing: -.02em; line-height: 1.1; font-variant-numeric: tabular-nums; margin-top: 6px; }

/* Nothing picked yet */
.tip { background: var(--pink); border-radius: 24px; padding: 18px 20px; display: flex; gap: 14px; align-items: flex-start; }
.tip-icon { flex: none; width: 44px; height: 44px; border-radius: 50%; background: var(--ink); color: #fff; display: grid; place-items: center; }
.tip-body { display: flex; flex-direction: column; gap: 6px; }
.tip h2 { margin: 0; font-size: 17px; font-weight: 800; }
.tip p { margin: 0; font-size: 15px; line-height: 1.45; }

/* Current line. Kept caption-dark so the pair colors read the same as on the video. */
.line {
  background: var(--ink); color: #fff; border-radius: 24px; padding: 20px;
  display: flex; flex-direction: column; gap: 12px;
}
.line .label { color: #fff; }
.line-head { display: flex; justify-content: space-between; align-items: baseline; }
.time { font-size: 13px; font-weight: 500; color: #fff; font-variant-numeric: tabular-nums; }
.tgt { font-size: 21px; font-weight: 700; line-height: 1.35; }
.tgt.pending { font-size: 15px; font-weight: 500; font-style: italic; color: #d8cfd4; }
.src { font-size: 16px; line-height: 1.4; color: #eee6ea; }
.tgt span[data-pair-index], .src span[data-pair-index] { cursor: pointer; border-radius: 4px; }
.tgt span[data-pair-index]:hover, .src span[data-pair-index]:hover { background: rgba(255, 255, 255, .12); }
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.chip {
  min-height: 32px; border: 1px solid color-mix(in srgb, var(--c) 60%, transparent);
  background: color-mix(in srgb, var(--c) 16%, transparent);
  color: var(--c); border-radius: 999px; padding: 4px 12px; font-size: 14px; font-weight: 600; cursor: pointer;
}
.chip[aria-pressed="true"] { background: var(--c); color: #0f0f0f; }
.note { background: rgba(255, 255, 255, .08); border-radius: 12px; padding: 10px 12px; font-size: 14px; }
.note .gloss { font-weight: 700; }
.note .detail { color: #eee6ea; margin-top: 2px; }
.line-actions { display: flex; gap: 12px; }
.line .pill-btn[aria-pressed="true"] { background: transparent; color: #fff; }

.btn {
  min-height: 36px; border: 2px solid var(--ink); background: transparent; color: var(--ink);
  border-radius: 999px; padding: 6px 14px; font-size: 14px; font-weight: 700; cursor: pointer;
}
.btn:hover { background: rgba(58, 44, 53, .08); }
.btn.small { padding: 4px 12px; font-size: 13px; }
.btns .btn:first-child { background: var(--ink); color: #fff; }

/* Sparkline */
.spark-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.seg { display: inline-flex; background: var(--bg); border-radius: 999px; padding: 3px; }
.seg button { min-height: 32px; border: 0; background: none; color: var(--ink-soft); font-size: 13px; font-weight: 600; padding: 4px 14px; border-radius: 999px; cursor: pointer; }
.seg button[aria-pressed="true"] { background: var(--surface); color: var(--ink); box-shadow: 0 1px 2px rgba(58, 44, 53, .2); }
#spark { display: block; width: 100%; height: 56px; overflow: visible; }
.spark-area { fill: var(--accent-soft); }
.spark-line { fill: none; stroke: var(--accent); stroke-width: 2.25; stroke-linejoin: round; stroke-linecap: round; }
.spark-dot { fill: var(--accent); }
.spark-axis { display: flex; justify-content: space-between; font-size: 12px; font-weight: 500; color: var(--muted); margin-top: 6px; }

/* Alerts */
#alerts:empty { display: none; }
.alert {
  border-radius: 24px; padding: 18px 20px; background: var(--surface);
  display: flex; flex-direction: column; gap: 12px; font-size: 16px; line-height: 1.45;
}
.alert[data-tone="warn"] { background: #F6E3E3; box-shadow: inset 0 0 0 2px var(--wine); }
.alert[data-tone="suggest"] { background: var(--pink); }
.alert .btns { display: flex; gap: 8px; flex-wrap: wrap; }

/* Toggles */
.row { display: flex; justify-content: space-between; align-items: center; gap: 12px; font-size: 16px; font-weight: 500; }
.switch { position: relative; flex: none; width: 52px; height: 32px; border: 0; padding: 0; border-radius: 999px; background: rgba(58, 44, 53, .3); cursor: pointer; }
.switch span { position: absolute; top: 4px; left: 4px; width: 24px; height: 24px; border-radius: 50%; background: #fff; transition: transform .15s; }
.switch[aria-checked="true"] { background: var(--olive); }
.switch[aria-checked="true"] span { transform: translateX(20px); }
@media (prefers-reduced-motion: reduce) { .switch span { transition: none; } }
`;
