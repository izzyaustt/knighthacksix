// Lives inside the panel's shadow root, so nothing here leaks into YouTube (or vice versa).
export const PANEL_CSS = `
:host {
  all: initial;
  position: fixed; top: 68px; right: 16px; z-index: 2300;
  font-family: Roboto, "YouTube Noto", Arial, sans-serif;
  --bg: #ffffff; --surface: #f2f2f2; --border: #e5e5e5; --text: #0f0f0f; --muted: #606060;
  --accent: #065fd4; --on-accent: #ffffff; --accent-soft: rgba(6, 95, 212, .12);
  --ok: #2ba640; --warn: #b26a00; --danger: #cc0000;
  color-scheme: light;
}
:host([data-theme="dark"]) {
  --bg: #212121; --surface: #2c2c2c; --border: #3f3f3f; --text: #f1f1f1; --muted: #aaaaaa;
  --accent: #3ea6ff; --on-accent: #0f0f0f; --accent-soft: rgba(62, 166, 255, .16);
  --ok: #4caf50; --warn: #ffb547; --danger: #ff6b6b;
  color-scheme: dark;
}
* { box-sizing: border-box; }
[hidden] { display: none !important; }
button { font: inherit; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.panel {
  width: 340px; max-height: calc(100vh - 84px); overflow-y: auto;
  display: flex; flex-direction: column; gap: 10px; padding: 14px;
  background: var(--bg); color: var(--text);
  border: 1px solid var(--border); border-radius: 14px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, .28);
  font-size: 13px; line-height: 1.4; outline: none;
}
@media (max-width: 520px) { .panel { width: calc(100vw - 32px); } }

/* Header */
header { display: flex; align-items: center; gap: 8px; }
.logo {
  width: 26px; height: 26px; border-radius: 7px; flex: none;
  display: grid; place-items: center; font-size: 11px; font-weight: 700; color: #0f0f0f;
  background: linear-gradient(135deg, #FFB547, #F06292);
}
.titles { min-width: 0; flex: 1; }
.name { font-weight: 600; }
.video-title { font-size: 11.5px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pill {
  flex: none; font-size: 11px; padding: 3px 8px; border-radius: 999px; white-space: nowrap;
  background: var(--surface); border: 1px solid var(--border);
  display: inline-flex; align-items: center; gap: 5px;
}
.pill::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--muted); }
.pill[data-state="working"]::before { background: var(--accent); animation: pulse 1.4s ease-in-out infinite; }
.pill[data-state="ready"]::before { background: var(--ok); }
.pill[data-state="warn"]::before { background: var(--warn); }
@keyframes pulse { 50% { opacity: .25; } }
@media (prefers-reduced-motion: reduce) { .pill::before { animation: none !important; } }
.icon {
  flex: none; width: 28px; height: 28px; border: 0; border-radius: 50%;
  background: none; color: var(--muted); font-size: 18px; line-height: 1; cursor: pointer;
}
.icon:hover { background: var(--surface); color: var(--text); }

/* Cards + numbers */
.card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 10px 12px; }
.label { font-size: 11px; letter-spacing: .04em; text-transform: uppercase; color: var(--muted); }
.stats { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.value { font-size: 24px; font-weight: 600; letter-spacing: -.02em; font-variant-numeric: tabular-nums; margin-top: 2px; }

/* Current line: always caption-dark so the pair palette reads the same as on the video */
.line {
  background: #0f0f0f; color: #fff; border-radius: 12px; padding: 10px 12px;
  display: flex; flex-direction: column; gap: 6px;
}
.line .label { color: #aaa; }
.line-head { display: flex; justify-content: space-between; align-items: center; }
.time { font-size: 11px; color: #aaa; font-variant-numeric: tabular-nums; }
.tgt { font-size: 17px; font-weight: 600; line-height: 1.3; }
.tgt.pending { font-size: 14px; font-weight: 400; font-style: italic; color: #aaa; }
.src { font-size: 13px; color: #cfcfcf; }
.tgt span[data-pair-index], .src span[data-pair-index] { cursor: pointer; border-radius: 3px; }
.tgt span[data-pair-index]:hover, .src span[data-pair-index]:hover { background: rgba(255, 255, 255, .1); }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip {
  border: 1px solid color-mix(in srgb, var(--c) 55%, transparent);
  background: color-mix(in srgb, var(--c) 14%, transparent);
  color: var(--c); border-radius: 999px; padding: 2px 9px; font-size: 12px; cursor: pointer;
}
.chip[aria-pressed="true"] { background: var(--c); color: #0f0f0f; }
.note { background: rgba(255, 255, 255, .07); border-radius: 8px; padding: 8px 10px; font-size: 12.5px; }
.note .gloss { font-weight: 600; }
.note .detail { color: #cfcfcf; margin-top: 2px; }
.line-actions { display: flex; gap: 6px; }

.btn {
  border: 1px solid var(--border); background: var(--bg); color: var(--text);
  border-radius: 8px; padding: 6px 10px; font-size: 12.5px; font-weight: 500; cursor: pointer;
}
.btn:hover { background: var(--surface); }
.btn.ghost { flex: 1; background: rgba(255, 255, 255, .06); border-color: rgba(255, 255, 255, .18); color: #fff; }
.btn.ghost:hover { background: rgba(255, 255, 255, .12); }
.btn.ghost[aria-pressed="true"] { border-color: #FFB547; color: #FFB547; }
.btn.small { padding: 4px 8px; font-size: 12px; }
.btn.primary { width: 100%; padding: 10px; background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
.btn.primary:hover { filter: brightness(1.08); }

/* Sparkline */
.spark-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.seg { display: inline-flex; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 2px; }
.seg button { border: 0; background: none; color: var(--muted); font-size: 11px; padding: 2px 8px; border-radius: 6px; cursor: pointer; }
.seg button[aria-pressed="true"] { background: var(--surface); color: var(--text); box-shadow: 0 0 0 1px var(--border); }
#spark { display: block; width: 100%; height: 48px; overflow: visible; }
.spark-area { fill: var(--accent-soft); }
.spark-line { fill: none; stroke: var(--accent); stroke-width: 1.75; stroke-linejoin: round; stroke-linecap: round; }
.spark-dot { fill: var(--accent); }
.spark-axis { display: flex; justify-content: space-between; font-size: 10px; color: var(--muted); margin-top: 4px; }

/* Alerts */
#alerts:empty { display: none; }
.alert {
  border-radius: 12px; padding: 10px 12px; border: 1px solid var(--border); background: var(--surface);
  display: flex; flex-direction: column; gap: 8px;
}
.alert[data-tone="warn"] { border-color: color-mix(in srgb, var(--warn) 45%, transparent); background: color-mix(in srgb, var(--warn) 10%, var(--bg)); }
.alert[data-tone="suggest"] { border-color: color-mix(in srgb, var(--accent) 40%, transparent); background: color-mix(in srgb, var(--accent) 8%, var(--bg)); }
.alert .btns { display: flex; gap: 6px; flex-wrap: wrap; }

/* Toggles */
.row { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.switch { position: relative; flex: none; width: 34px; height: 20px; border: 0; padding: 0; border-radius: 999px; background: var(--border); cursor: pointer; }
.switch span { position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: transform .15s; }
.switch[aria-checked="true"] { background: var(--ok); }
.switch[aria-checked="true"] span { transform: translateX(14px); }
`;
