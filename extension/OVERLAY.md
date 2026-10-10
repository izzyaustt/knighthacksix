# Task: colored bilingual caption overlay (Person A / Extension lead)

## Context
Chrome extension (Manifest V3, TypeScript, Vite) that overlays bilingual, color-aligned captions
on YouTube. Caption capture already works: `src/content.ts` receives the player's `/api/timedtext`
response via `postMessage` from `src/main-world.ts` and parses it into:

```ts
type Line = { start: number; end: number; text: string };  // seconds
```
and logs `[LL content] lines N [...]` once per video.

This task covers the **hour-12 milestone, extension side**: hide YouTube's captions, render our own
overlay, keep it in sync with the video, and color aligned pairs. Alignment comes from a **mock**
for now; Person B/C are building the real `POST /align` endpoint in parallel. Keep the boundary
clean so swapping in the real call is a one-function change.

Do not change the caption-capture logic in `main-world.ts` beyond what's needed here. CC must stay
**on** in the player (that's what triggers the capture). We only hide it visually.

---

## Shared type (from the Project Specs; do not change the shape)

Create `src/types.ts`:
```ts
export type Line = { start: number; end: number; text: string };

export type Pair = { src: string; tgt: string; note?: string };

export type AlignedLine = {
  start: number;
  end: number;
  src: string;    // English (source)
  tgt: string;    // Spanish (target)
  pairs: Pair[];
};
```

---

## Step 1: Hide native captions

Inject a `<style>` once from `content.ts`:
```css
.ytp-caption-window-container { display: none !important; }
```
Do **not** click the CC button off. The player must keep fetching captions.

## Step 2: Inject the overlay

Create `src/overlay.ts` exporting a small controller:
```ts
export function mountOverlay(): { root: HTMLElement; destroy(): void }
```
- Append a `div#ll-overlay` **inside `#movie_player`** (so it survives fullscreen/theater mode).
- Position: `position:absolute; left:50%; transform:translateX(-50%); bottom:12%; z-index:60;
  pointer-events:none; text-align:center; max-width:80%`.
- Two rows: `.ll-src` (English, ~0.9em, slightly dimmer) above `.ll-tgt` (Spanish, larger, bold).
- Background `rgba(8,8,8,.75)`, rounded corners, padding; hide the whole box when there is no
  current line.
- Font size relative to the player: set `font-size` from `player.clientHeight * 0.04` and update
  on a `ResizeObserver` on `#movie_player`.
- Lift the overlay when the controls are showing: `#movie_player:not(.ytp-autohide) #ll-overlay
  { bottom: 16%; }`.
- Idempotent: if `#ll-overlay` already exists, reuse it. On `yt-navigate-finish`, clear it.
- Build text with DOM nodes (`textContent`), **never `innerHTML`**; caption text is untrusted.

## Step 3: Sync to `video.currentTime`

Create `src/sync.ts`:
```ts
export function startSync(
  video: HTMLVideoElement,
  getLines: () => AlignedLine[],
  render: (line: AlignedLine | null) => void
): () => void   // returns stop()
```
- Get the video with `document.querySelector<HTMLVideoElement>('#movie_player video.html5-main-video')`.
- Loop with `requestAnimationFrame`. Each frame, read `video.currentTime` and **binary-search**
  the sorted lines for the one where `start <= t < end`. If none, `null`.
- Only call `render` when the active line's index changes (no DOM work on every frame).
- Pause, seek, and playback-rate changes then work automatically. Also listen for `seeked` to
  force an immediate re-render.
- Hide the overlay while an ad plays (`#movie_player.ad-showing`).
- `getLines` is a getter because aligned batches will arrive progressively and replace mock/raw
  lines in place. Lines without alignment yet should still render: show `src` with an empty `tgt`
  row and no colors.

## Step 4: Mock alignment + pair coloring

### 4a. Mock aligner (`src/align.ts`)
```ts
export async function alignLines(lines: Line[]): Promise<AlignedLine[]>
```
For now return mock data so coloring can be built and demoed:
- `tgt` = the source text with a visible marker, e.g. `"(ES) " + text`.
- `pairs` = group the source words into chunks of 1–2 words; each pair's `src` and `tgt` is that
  same chunk (so it can be found in both strings).
- Add a hardcoded real Spanish example and use it for any line whose text matches, to sanity-check
  real phrase pairs:
```ts
{ src: "how are you?", tgt: "¿cómo estás?", pairs: [
  { src: "how", tgt: "cómo", note: "interrogative adverb" },
  { src: "are you", tgt: "estás", note: "estar, 2nd person singular, present" } ] }
```
Mirror the real flow even with the mock: align the **first 30 lines immediately**, then the rest in
batches of 30 in the background, merging each batch into the lines array as it resolves. Later
this function's body becomes a `chrome.runtime.sendMessage` to the service worker, which calls
`POST /align` (`{ lang_src: "en", lang_tgt: "es", level: "A2", lines }` → `{ lines: AlignedLine[] }`).
Nothing else should need to change.

### 4b. Coloring (`src/colorize.ts`)
```ts
export const PALETTE = ['#FFB547','#4FC3F7','#AED581','#F06292','#BA68C8','#4DD0E1','#FF8A65','#DCE775'];
export function renderColored(text: string, phrases: string[]): DocumentFragment
```
- Pair `i` gets `PALETTE[i % PALETTE.length]` on **both** rows (same color for `pairs[i].src` in
  `.ll-src` and `pairs[i].tgt` in `.ll-tgt`).
- For each phrase, find it in the text case-insensitively, at word boundaries (Unicode-aware, so
  `¿`, `é`, `ñ` work: use `\p{L}` with the `u` flag rather than `\b`). Skip matches that overlap
  an already-claimed range. Spanish order differs, so search the whole string, not left-to-right.
- Sort claimed ranges, emit `<span style="color:…">` for matched ranges and plain text nodes for
  the rest.
- Per spec: if a pair's text isn't found, just leave it uncolored. Never throw.
- Put `data-pair-index` on each span (the sidebar click-to-explain will use it in Phase 3).

---

## Wiring in `content.ts`
On captured `lines`:
1. inject the hide-captions style, `mountOverlay()`
2. `let aligned: AlignedLine[] = lines.map(l => ({ ...l, src: l.text, tgt: '', pairs: [] }))`
3. `startSync(video, () => aligned, renderLine)`
4. `alignLines(...)` progressively replaces entries in `aligned`
On `yt-navigate-finish`: stop sync, clear overlay, reset state.

## Done when
- `npm run build` passes with no TS errors.
- On a YouTube video with captions: native captions are hidden; our overlay shows English + (mock)
  Spanish, with matching colors per pair, in sync with the audio.
- Pause, seek (click the progress bar), 1.5x/0.5x speed, fullscreen, and theater mode all behave.
- Clicking to a different video resets and loads the new captions with no duplicate overlays.
- The `"how are you?" / "¿cómo estás?"` example renders `how`↔`cómo` and `are you`↔`estás` in
  matching colors (test by temporarily injecting that line at t=0 if the video doesn't contain it).
