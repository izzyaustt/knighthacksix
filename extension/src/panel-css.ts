// Lives inside the panel's shadow root, so nothing here leaks into YouTube (or vice versa).
export const PANEL_CSS = `
:host {
  all: initial;
  position: fixed; top: 0; right: 0; bottom: 0; z-index: 2300;
  width: var(--ll-panel-width, 400px); max-width: 100vw; height: 100vh; height: 100dvh;
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
button, select { font: inherit; }
#learning-language { max-width: 180px; min-height: 40px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); color: var(--ink); padding: 6px; }
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
/* Collapsed: the host shrinks to a logo bubble so the rest of the page stays clickable. */
:host(.collapsed) { top: auto; bottom: 24px; right: 24px; width: 68px; height: 68px; }
.bubble {
  width: 68px; height: 68px; padding: 0; border-radius: 50%; display: grid; place-items: center; cursor: pointer;
  background: var(--sand); border: 1px solid var(--border); box-shadow: 0 6px 20px rgba(0, 0, 0, .28);
  transition: transform .15s;
}
.bubble:hover { transform: scale(1.06); }
.bubble img { display: block; width: 52px; height: 53px; }
@media (max-height: 640px) {
  .view.lookup { gap: 14px; padding-top: 10px; }
  .view.signin { gap: 24px; padding: 24px; }
  .word { font-size: 40px; }
}
.view { display: flex; flex-direction: column; flex: 1 0 auto; }
.view > footer { margin-top: auto; }
.eyebrow { font-size: 13px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; margin: 0; }

/* Sign in */
.view.signin { align-items: center; justify-content: center; gap: 40px; padding: 48px 32px; position: relative; }
.signin-top { position: absolute; top: 12px; right: 12px; }
.brand { display: flex; flex-direction: column; align-items: center; gap: 12px; }
.wordmark { display: block; width: 300px; max-width: 100%; height: auto; }
.brand-link { display: block; max-width: 100%; padding: 0; border: 0; background: none; border-radius: 12px; cursor: pointer; }
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
.translation-status { display: flex; align-items: center; padding-left: 4px; }
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

/* Nothing picked yet: the mascot empty state */
.view.home { gap: 0; padding: 12px 16px 28px; }
.empty { flex: 1 0 auto; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; padding: 24px 12px; text-align: center; }
.mascot { display: block; width: 155px; height: auto; margin-bottom: 18px; }
.empty-text { margin: 0; font-size: 20px; font-weight: 700; line-height: 1.3; color: var(--ink); max-width: 260px; }
.empty-text + .empty-text { margin-top: 10px; }
.empty .pill { margin-top: 6px; }
.empty #alerts { width: 100%; max-width: 320px; text-align: left; }
.mini-settings { display: flex; flex-direction: column; gap: 10px; padding: 14px 8px; font-size: 14px; }
.mini-settings .row { font-size: 14px; }
.mini-settings #language-note { margin: 0; font-size: 12px; color: var(--ink-soft); }

/* First-run tour */
.view.tour { gap: 0; padding: 16px 20px 20px; --tour-green: #2F8B68; }
.tour-logo { display: block; height: 40px; width: auto; max-width: 100%; }
.tour-title { margin: 16px 0 4px; font-size: 22px; line-height: 1.2; font-weight: 800; letter-spacing: -.02em; }
.tour-sub { margin: 0 0 14px; font-size: 13px; color: var(--ink-soft); }
.tour-visual { position: relative; background: #fffdfa; border-radius: 24px; min-height: 176px; overflow: hidden; display: flex; flex-direction: column; justify-content: center; box-shadow: 0 1px 3px rgba(58, 44, 53, .14); }
.tour-callout { position: relative; margin-top: 16px; background: var(--tour-green); color: #fff; border-radius: 24px; padding: 18px 20px 20px; }
.tour-callout::before { content: ""; position: absolute; top: -8px; left: 50%; width: 18px; height: 18px; background: var(--tour-green); border-radius: 3px; transform: translateX(-50%) rotate(45deg); }
.tour-count { display: block; text-align: right; font-size: 11px; font-weight: 800; letter-spacing: .08em; opacity: .85; }
.tour-callout h2 { margin: 8px 0 4px; font-size: 18px; font-weight: 800; letter-spacing: -.01em; }
.tour-callout p { margin: 0; font-size: 13.5px; line-height: 1.45; }
.tour-dots { display: flex; justify-content: center; align-items: center; gap: 12px; margin-top: auto; padding: 22px 0 14px; }
.tour-dots span { width: 8px; height: 8px; border-radius: 999px; background: rgba(94, 97, 40, .35); }
.tour-dots span.on { width: 22px; background: var(--olive); }
.tour-nav { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.tour-links { display: flex; align-items: center; gap: 18px; }
.tour-back, .tour-skip { min-height: 44px; border: 0; background: none; padding: 0; font-size: 14px; font-weight: 700; color: var(--ink-soft); cursor: pointer; }
.tour-skip { text-decoration: underline; }
.tour-back:hover, .tour-skip:hover { color: var(--ink); }
.tour-next { min-height: 46px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 0 20px; border: 0; border-radius: 16px; background: var(--pink); color: var(--ink); font-size: 15px; font-weight: 800; cursor: pointer; }
.tour-next:hover { filter: brightness(.97); }

/* Tour illustrations */
.t-video { height: 118px; padding: 12px 14px; display: flex; flex-direction: column; justify-content: space-between; color: #fff;
  background: linear-gradient(135deg, #7c5f43, #c19a6b 55%, #5f4c36); }
.t-video-title { font-size: 13px; font-weight: 700; text-shadow: 0 1px 3px rgba(0, 0, 0, .5); }
.t-video-bar { display: flex; align-items: center; gap: 10px; font-size: 11px; font-weight: 700; }
.t-play { width: 0; height: 0; border-left: 8px solid #fff; border-top: 5px solid transparent; border-bottom: 5px solid transparent; }
.t-track { flex: 1; height: 4px; border-radius: 4px; background: rgba(255, 255, 255, .45); }
.t-track i { display: block; width: 34%; height: 100%; border-radius: 4px; background: #e53935; }
.t-meta { padding: 12px 18px 14px; display: flex; flex-direction: column; gap: 2px; }
.t-meta strong { font-size: 15px; }
.t-meta span { font-size: 13px; color: var(--ink-soft); }
.t-stage { height: 126px; display: grid; place-items: center; background: linear-gradient(160deg, #8f8b64, #6b6a45 60%, #4f4f38); }
.t-caption { background: #2b2229; color: #fff; padding: 10px 14px; border-radius: 14px; font-size: 15px; font-weight: 600; box-shadow: 0 6px 18px rgba(0, 0, 0, .25); }
.t-caption mark { color: #fff; border-radius: 6px; padding: 1px 7px; font-weight: 800; }
.t-caption .c1 { background: #cf6c79; }
.t-caption .c2 { background: #7f8a2c; }
.t-hint { padding: 12px; text-align: center; font-size: 14px; font-weight: 800; color: var(--olive); }
.t-word { position: relative; padding: 18px 20px 14px; display: flex; flex-direction: column; gap: 2px; }
.t-eyebrow { font-size: 11px; font-weight: 800; letter-spacing: .1em; color: var(--olive); }
.t-big { font-size: 28px; font-weight: 800; letter-spacing: -.02em; line-height: 1.1; }
.t-big.sm { font-size: 22px; display: block; }
.t-pron { font-size: 13px; color: var(--ink-soft); }
.t-rule { height: 1px; background: var(--border); margin: 12px 0 10px; }
.t-row { display: flex; justify-content: space-between; align-items: baseline; }
.t-row span { font-size: 13px; color: var(--ink-soft); }
.t-speaker { position: absolute; top: 14px; right: 16px; width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center; background: #e7e9cf; color: var(--olive); }
.t-bar { height: 14px; margin: 0 8px; border-radius: 10px 10px 0 0; background: var(--olive); }
.t-save { padding: 18px 14px 14px; display: flex; flex-direction: column; gap: 14px; background: linear-gradient(120deg, #fffdfa 60%, #fbe9e6); }
.t-save-card { display: flex; align-items: center; justify-content: space-between; background: #fff; border: 1px solid var(--border); border-radius: 18px; padding: 14px 16px; }
.t-save-card span:not(.t-bookmark) { font-size: 13px; color: var(--ink-soft); }
.t-bookmark { width: 46px; height: 46px; border-radius: 50%; display: grid; place-items: center; background: #e7e9cf; color: var(--olive); }
.t-saved { display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 13px; font-weight: 800; color: var(--olive); }
.t-check { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; background: var(--olive); color: #fff; font-size: 12px; }
.t-dash { display: flex; height: 176px; background: #fffdfa; }
.t-dash-side { width: 74px; padding: 12px 8px; display: flex; flex-direction: column; gap: 8px; background: #f3e9df; font-size: 9px; }
.t-dash-side i { font-style: normal; font-weight: 700; color: var(--ink-soft); }
.t-dash-side i.on { color: var(--olive); }
.t-dash-main { flex: 1; min-width: 0; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; }
.t-dash-head { font-size: 11px; font-weight: 800; color: var(--olive); }
.t-dash-grid { display: grid; grid-template-columns: repeat(16, 1fr); gap: 3px; padding: 8px; border-radius: 8px; background: #fff; box-shadow: 0 0 0 1px var(--border); }
.t-dash-grid s { aspect-ratio: 1; border-radius: 2px; background: #e8e3d6; }
.t-dash-grid s.h1 { background: #bde5a5; } .t-dash-grid s.h2 { background: #6fc05a; } .t-dash-grid s.h3 { background: #2f8f45; }
.t-dash-olive { margin-top: auto; padding: 10px 12px; border-radius: 10px 10px 0 0; background: var(--olive); color: #fff; font-size: 10px; font-weight: 700; }
@media (max-height: 700px) { .tour-title { font-size: 20px; margin-top: 8px; } .tour-visual { min-height: 140px; } .t-video { height: 92px; } .t-stage { height: 100px; } .t-dash { height: 140px; } }
`;