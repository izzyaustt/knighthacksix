# Learning panel (toolbar icon → glanceable sidebar)

## What it is
Clicking the extension icon (or **Alt+L**) toggles an injected panel on the YouTube page. Per the
Project Specs it's a plain injected element (in a shadow root, so YouTube CSS can't touch it), not
Chrome's side panel API. That lets it read the current caption line and the `<video>` directly.
On any non-YouTube tab, the icon opens the dashboard instead.

## What it shows
| Section | Content | Source |
|---|---|---|
| Header | App name, video title, status pill (Loading captions / Translating 40% / Ready / Partly translated) | `content.ts` → `panel.setStatus` |
| Two numbers | **Practice today** (minutes actually watched with captions) and **Lookups today** | local `ll:stats:YYYY-MM-DD` + unflushed seconds |
| Current line | Spanish + English with the same pair colors as the overlay; pair chips; click a chip or colored word for its note | `startSync` render callback → `panel.setLine` |
| Actions | **Replay** (seek to line start), **Save phrase/line** (☆/★ toggle) | `video.currentTime`, `events.toggleVocab` |
| Alerts | No video, waiting for captions, failed batches, captions hidden, "replayed 3× → save it?" | computed every second |
| Sparkline | Watch activity, last 30 min (per minute) or 24 h (per hour) | same local stats |
| Toggle | Bilingual captions on/off (restores YouTube's own captions when off) | `content.ts` `setCaptionsOn` |
| Footer | **Open dashboard →** `DASHBOARD/?video_id=…&t=83&range=24h` (the dashboard has its own Google sign-in) | `settings.dashboardLink` |

## Files
| File | Change |
|---|---|
| `src/panel.ts`, `src/panel-css.ts` | New: the panel |
| `src/background.ts` | New service worker: icon click, forwards events/saves to the backend, opens the dashboard |
| `src/events.ts` | New: `logEvent()` (spec event types) and vocab save/unsave |
| `src/stats.ts`, `src/watch.ts` | New: local per-minute watch buckets and daily counters |
| `src/settings.ts` | New: `backendUrl`, `dashboardUrl`, langs, level |
| `src/content.ts` | Creates the panel, feeds it lines/status, starts the watch tracker, emits `caption_view` |
| `manifest.json` | `action`, `Alt+L` command, background worker, `storage`, localhost host permissions |
| `tsconfig.json` | `"types": ["vite/client", "chrome"]` so `chrome.*` type-checks |

## Events emitted (Project Specs schema)
- `caption_view`: once when captions load, then once per full minute actually watched
- `lookup`: first time a pair is opened per line (`word` = Spanish phrase, `meta.src/note/line`)
- `save`: on Save; also `POST /vocab { word, translation, video_id, video_ts }`

With no `backendUrl` set, everything stays local and the panel still works. To point at Person C's
backend before the options page exists, run in the service worker's DevTools console:
`chrome.storage.local.set({ settings: { backendUrl: 'http://localhost:8000', dashboardUrl: 'http://localhost:5173' } })`

## Hooks for later phases
- Phase 6 explain: the note box is where `/explain` (gloss, grammar note, example, formality) lands.
- Phase 7/8: add Hear it / Slow / Record buttons next to Replay; `logEvent({ event_type: 'shadow_attempt', score })` already feeds `DayStats.shadow`, so a "Shadow avg" number can replace Lookups.
- Un-save is local only (the API has no `DELETE /vocab`).
- A non-localhost backend needs its origin added to `host_permissions`.

## Google account chooser

The sidebar now uses an explicit Google account chooser instead of Chrome’s cached profile login. Every click on Sign in with Google requests `prompt=select_account`. Closing the Google window leaves the sidebar signed out.

1. Copy `.env.example` to `.env` and set `VITE_GOOGLE_CLIENT_ID` to the **Web application** client ID used by the dashboard and backend (`GOOGLE_WEB_CLIENT_ID`). Do not use the Chrome Extension client ID for this flow.
2. In Google Cloud → Google Auth Platform → Clients, open that Web application client and add this exact **Authorized redirect URI** for the current extension:
   `https://ikojopihmoepapcekacledaaedjlbdin.chromiumapp.org/google-auth`
3. Save, rebuild the extension, reload **langtube** in `chrome://extensions`, and refresh YouTube.
4. Sign out, click Sign in with Google, and confirm Google shows account selection. Close it to check you remain signed out. Reopen it and choose an account to check login completes.

The extension ID comes from the manifest key; if that key changes, register the new redirect URI returned by `chrome.identity.getRedirectURL('google-auth')`. For deployment, configure HTTPS backend/dashboard origins too.
