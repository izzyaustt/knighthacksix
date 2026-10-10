# Chrome Extension Build Steps

**Owner:** Person A / extension lead  
**Goal:** Watch a YouTube video with color-aligned bilingual captions, click a phrase for an explanation and pronunciation, record a line, and see feedback that reaches the dashboard.

Start with English-to-Spanish and one demo video with clean manual captions. Add optional features only after the full learning loop works.

## Current starting point

The extension already has a Manifest V3 configuration, TypeScript, Vite, and CRXJS. `src/main-world.ts` reads caption tracks from the YouTube player and sends them to `src/content.ts`. The content script fetches JSON3 captions, converts them into timestamped lines, and logs them.

This is existing code, not a verified working milestone. Confirm it in Chrome before building on it. The manifest still has a placeholder name, and the starter `index.html` references a missing `src/main.ts`; decide whether that page is needed before using it as an extension page.

## 1. Agree on contracts with the team

- [ ] Ask Person C for the backend URL and mock responses.
- [ ] Agree with Person B on the aligned-caption and speech-scoring response shapes.
- [ ] Use a shared demo user ID so extension events and dashboard queries refer to the same user.
- [ ] Decide who logs `shadow_attempt`: the extension or the backend. Log each completed attempt once.
- [ ] Keep Gemini, ElevenLabs, and database credentials in the backend. The extension uses only the backend URL.

### Endpoints the extension consumes

| Endpoint | Purpose | Owner |
| --- | --- | --- |
| `POST /align` | Translate caption batches and return aligned phrase pairs | B supplies AI logic; C integrates route |
| `POST /explain` | Return gloss, grammar note, example, and formality | B supplies AI logic; C integrates route |
| `POST /tts` | Return pronunciation audio for text, language, and speed | B supplies speech logic; C integrates route |
| `POST /stt` | Accept multipart audio and target text; return transcript, score, and word results | B supplies transcription/scoring; C integrates route |
| `POST /events` | Store learning events | C |
| `POST /vocab` | Save a phrase or word, if time allows | C |
| `GET /vocab` | Retrieve saved vocabulary, if time allows | C |

Example aligned line from the project specs:

```json
{
  "start": 12.4,
  "end": 14.1,
  "src": "how are you?",
  "tgt": "¿cómo estás?",
  "pairs": [
    { "src": "how", "tgt": "cómo", "note": "interrogative adverb" },
    { "src": "are you", "tgt": "estás", "note": "estar, 2nd person singular, present" }
  ]
}
```

**Done when:** you can build the UI against agreed mock responses without waiting for real providers.

## 2. Confirm the extension loads

- [ ] In `extension/`, run `npm install` if dependencies are missing, then `npm run build`.
- [ ] Open `chrome://extensions`, enable Developer mode, and load the generated `extension/dist` folder as an unpacked extension.
- [ ] Open the demo YouTube video and confirm the content-script logs appear.
- [ ] Replace the placeholder extension name in `manifest.json`.
- [ ] Add a background service worker for backend requests and cache access. Register it in the manifest.
- [ ] Add the permissions needed for storage and access to the chosen backend origin.
- [ ] Rebuild and reload after manifest changes.

**Done when:** Chrome loads the extension, the content script runs on YouTube, and a request through the worker reaches a mock backend endpoint.

## 3. Make caption extraction reliable

Work from `src/main-world.ts` and `src/content.ts`.

- [ ] Confirm the existing player bridge returns the correct video ID and caption tracks.
- [ ] Prefer an English manual track; fall back to an English automatic track when available.
- [ ] Handle an empty track list without trying to fetch an undefined URL.
- [ ] Check the HTTP response and handle empty or malformed caption data.
- [ ] Convert JSON3 events into `{ start, end, text }` lines and filter empty text.
- [ ] Validate bridge messages: same window, expected source/type, and expected payload fields.
- [ ] Reset the transcript and UI when the video changes through YouTube navigation.
- [ ] Ignore results from an earlier video if their requests finish after navigation.
- [ ] Show a clear no-captions state.
- [ ] If transcript fetching blocks progress, observe YouTube's visible caption element as a fallback. This supports only currently visible captions, without full-transcript pre-translation.

**Done when:** timestamped captions load for the demo video and refresh when navigating to another video.

## 4. Build the synced overlay with mock data

- [ ] Inject one overlay into the video player; avoid duplicates after navigation.
- [ ] Show the source line and target line together.
- [ ] Assign each aligned pair a color from a fixed palette. Use the same color for its source and target phrases.
- [ ] Respect each language's original phrase order; do not reconstruct target text by source order.
- [ ] Use `video.currentTime` to find the active line, with `start <= time < end`.
- [ ] Clear captions between lines and handle pause, seek, and playback-speed changes.
- [ ] Verify positioning in normal, theater, and fullscreen views.
- [ ] Hide native captions while the custom overlay is enabled; restore them when it is disabled or removed.
- [ ] Render provider text as text content, rather than inserting it as raw HTML.
- [ ] If alignment is invalid, show readable uncolored text instead of breaking playback.

**Done when:** a mock bilingual transcript stays in sync through playback, seeking, and speed changes.

## 5. Connect real alignment and caching

- [ ] Send transcript batches of approximately 30 lines to `/align` through the background worker.
- [ ] Request the first batch immediately, then process remaining batches in the background.
- [ ] Keep original timestamps attached to each translated line.
- [ ] Validate responses before replacing mock data.
- [ ] Cache aligned results in `chrome.storage.local` by video ID, source language, target language, and level.
- [ ] Reuse cached results when reopening the same video and settings.
- [ ] Display loading and retry states without blocking video playback.
- [ ] Stop or disregard stale batch responses after a video or language change.

**Hour-12 milestone:** a real YouTube video plays with Gemini-aligned bilingual captions in matching colors and correct timing.

## 6. Add the explanation sidebar

- [ ] Make caption phrases clickable and keyboard accessible.
- [ ] Open an injected sidebar with the selected phrase and its surrounding line.
- [ ] Show the alignment note immediately when available.
- [ ] Call `/explain` for the gloss, grammar note, example, and formality.
- [ ] Add loading, error, close, and retry controls.
- [ ] Prevent an older explanation request from replacing the currently selected phrase.
- [ ] Emit a `lookup` event when the user selects a phrase.

**Done when:** clicking a phrase opens the correct explanation without disrupting caption timing.

## 7. Add pronunciation playback

- [ ] Add play controls for the selected phrase and the full target line.
- [ ] Request `/tts` with `{ text, lang, speed }`.
- [ ] Coordinate with B and C on how binary audio reaches the content script through extension messaging; do not assume a Blob can be passed directly.
- [ ] Play the returned audio and release temporary object URLs when no longer needed.
- [ ] Add normal and slow playback options using the speed values agreed with B.
- [ ] Stop previous audio before starting another pronunciation.
- [ ] Show audio-loading and playback-error states.
- [ ] Pause the video during practice so its audio does not compete with pronunciation playback.

**Done when:** a selected phrase and a full line both play in normal and slow modes.

## 8. Record a shadowing attempt

Test microphone access early, during setup, even though the full UI is built here.

- [ ] Try microphone access from the intended recording surface on the demo laptop.
- [ ] If the content script cannot record reliably, use an extension page or offscreen document; agree on this before building the full flow.
- [ ] Add record, stop, and cancel controls with a visible recording indicator.
- [ ] Freeze the target line for the attempt so caption changes do not change what is being scored.
- [ ] Pause video and pronunciation audio before recording.
- [ ] Record using a supported `MediaRecorder` format and confirm B's transcription endpoint accepts it.
- [ ] Submit the recording to `/stt` as multipart `audio` and `target_text`.
- [ ] Stop microphone tracks when recording ends, is cancelled, or the recording surface closes.
- [ ] Handle permission denial, missing microphone, empty recording, and upload failure.
- [ ] Prevent duplicate submissions while an attempt is processing.

**Done when:** a real recorded Spanish line reaches Scribe and returns a transcript and score.

## 9. Display feedback and log events

- [ ] Show the expected line, recognized transcript, and overall score.
- [ ] Confirm with B whether the API score uses 0-1 or 0-100, then format it consistently.
- [ ] Render per-word statuses such as correct, missed, and substituted.
- [ ] Preserve phrase colors where possible; mark missed/substituted words with text or underlining as well as color.
- [ ] Label the result as intelligibility feedback. The score compares recognized words with the target; it does not measure phonetic accent accuracy.
- [ ] Log the completed `shadow_attempt` with user ID, video ID, language, score, target text, transcript, and word results using the agreed event schema.
- [ ] Log `caption_view` according to the agreed cadence and avoid duplicate timers after navigation.
- [ ] Keep event-write failures separate from the displayed speech result, and provide a recoverable state.
- [ ] With C and D, verify that the same attempt appears in storage and the dashboard within 1-2 seconds.

**Hour-20 milestone:** click a phrase, hear it, record a line, see feedback, and watch that attempt appear on the dashboard.

## 10. Add optional vocabulary features

Only start after the full learning loop works.

- [ ] Add Save to vocabulary in the sidebar.
- [ ] Send the phrase, translation, video ID, and video timestamp to `/vocab`.
- [ ] Emit a `save` event after a successful save, following the agreed logging ownership.
- [ ] Add a basic saved-vocabulary list.
- [ ] Add minimal target-language, level, and backend-URL settings if needed.

## 11. Verify the extension and prepare the demo

- [ ] Run `npm run build` and load that build in Chrome.
- [ ] Try at least three videos, including manual captions, automatic captions, and missing captions.
- [ ] Check seeking, pausing, speed changes, navigation, ads, long transcripts, and fullscreen.
- [ ] Check backend failures, malformed alignment, slow responses, microphone denial, and audio failure.
- [ ] Confirm navigating repeatedly does not create duplicate overlays, listeners, or event timers.
- [ ] Confirm no provider keys or database credentials are included in the extension build.
- [ ] Run the full demo twice without editing code.
- [ ] Pre-cache the demo video's aligned captions and pronunciation audio.
- [ ] Test the microphone and speakers in the actual judging room.
- [ ] Give D screenshots and help record a backup demo during the freeze window.

**Hour-28 milestone:** the full demo runs cleanly twice. Freeze features, fix bugs, and rehearse.

## Suggested module boundaries

These are proposed files, not files that already exist.

| Module | Responsibility |
| --- | --- |
| `src/main-world.ts` | YouTube player access and caption-track bridge |
| `src/content.ts` | Coordinate navigation, transcript, overlay, and sidebar |
| `src/background.ts` | Backend requests, extension messages, and caching |
| `src/types.ts` | Shared caption, alignment, score, and event types |
| `src/captions.ts` | JSON3 parsing and active-line lookup |
| `src/overlay.ts` | Bilingual caption rendering and player positioning |
| `src/sidebar.ts` | Explanations and pronunciation controls |
| `src/recording.ts` | Recording lifecycle and feedback UI |
| `src/events.ts` | Learning-event construction and submission |
| `src/style.css` | Scoped overlay/sidebar styles that avoid changing YouTube's page styles |

## Priority if time gets tight

1. Reliable captions and a synced colored bilingual overlay.
2. Phrase explanations and pronunciation playback.
3. Recording, scoring, and a live dashboard update.
4. Vocabulary saving and extra settings.

Keep Netflix, additional languages, voice tutoring, and other stretch features outside this checklist until the core demo is complete.

## Reference documents

- [Project Specs](./Project%20Specs.pdf): architecture, caption format, endpoints, and event schema.
- [Timeline + Build Steps](./Timeline%20%2B%20Build%20Steps.pdf): milestones and freeze window.
- [MVP + Suggested Prize Tracks](./MVP%20%2B%20Suggested%20Prize%20Tracks.pdf): required features and scope priorities.
- [Demo Guide](./Demo%20Guide.pdf): demo rehearsal and fallback preparation.
