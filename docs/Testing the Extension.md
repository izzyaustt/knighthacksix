# Test the extension one checkpoint at a time

This build connects English YouTube captions to `/align`, a synchronized bilingual overlay, phrase explanations, vocabulary saves, pronunciation, and recording feedback. It uses Spanish and `demo-user`. Dashboard UI, authentication, watched-time tracking, and a dedicated extension recording window remain separate work.

## 0. Runtime and automated checks

Use Node **22.18+**, preferably Node 24. This machine's default Node 20 cannot run the backend's TypeScript imports or the caption tests. A newer runtime is already available locally:

```sh
export LL_NODE=/Users/kamillamamatova/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node
```

From `knighthacksix/extension`:

```sh
"$LL_NODE" --test test/captions.test.mjs
"$LL_NODE" node_modules/typescript/bin/tsc --noEmit
"$LL_NODE" node_modules/vite/bin/vite.js build
```

With Node 22.18+ as your normal runtime, use `npm test` and `npm run build` instead. Dependencies are already installed here; fresh checkouts need `npm ci` in both `extension` and `backend`.

From `knighthacksix/backend`:

```sh
"$LL_NODE" --test test/extension-api.test.mjs
"$LL_NODE" node_modules/typescript/bin/tsc
```

Or use `npm run test:extension` and `npm run typecheck`. The mock API test temporarily uses port 3097 and stops its server afterward. It makes no paid calls and writes no database records. Caption tests check timing, seeks, gaps, and phrase ordering.

## 1. Overlay without translation charges

From `knighthacksix/backend`, keep this terminal running:

```sh
MOCK=1 "$LL_NODE" server.mjs
```

Or `MOCK=1 npm start` with a supported normal Node runtime. The extension expects port **3000**; do not override `PORT`.

1. Build the extension as above.
2. Open `chrome://extensions`. Reload the extension, or **Load unpacked** → `knighthacksix/extension/dist`.
3. Confirm it is enabled; accept localhost access if Chrome requests it.
4. Refresh YouTube and play a short video with English captions. Turn **CC** on.
5. Expect a **Spanish overlay** toolbar and two caption rows. The mock target starts with **[ES]**; it is not a real translation.
6. Pause and seek forward/backward. Captions should follow playback and disappear in gaps. Ads should not show lesson captions.
7. Click **Spanish overlay** to disable it. Original YouTube captions should return.
8. Navigate to another video without reloading. The old captions should be replaced.
9. Stop the backend and open another video. Expect a connection error. Restart it and click **Retry**.

Only `/align` and `/explain` are mocked. **Listen/Slow/Record still call ElevenLabs**, and **phrase clicks/saves write real demo-user database events**. Use those at later checkpoints.

## 2. Real translation and explanations

Stop the mock server with Ctrl+C, then start normally:

```sh
"$LL_NODE" server.mjs
```

Or `npm start` with a supported runtime. Refresh YouTube to clear mock captions. This uses Gemini quota. Start with a short video: captions are translated in batches of up to 30, starting near playback, then processing the remaining captions.

Expected: natural Spanish; corresponding phrases share colors; clicking a phrase pauses the video and shows its meaning, grammar note, example, and tone. **Practice this line** selects the whole Spanish caption. Closing the panel leaves playback paused.

If it fails, check the backend terminal and `GEMINI_MODEL` configuration. `/health` reports key presence, not key/model validity.

## 3. Vocabulary and database

In another terminal:

```sh
curl http://localhost:3000/health/database
```

Expected: `{"ok":true,"database":"connected"}`. Select a phrase and click **Save phrase**, then:

```sh
curl 'http://localhost:3000/vocab?user_id=demo-user&lang=es'
curl 'http://localhost:3000/stats/recent?user_id=demo-user&lang=es'
```

The phrase should appear under `words`; recent events should include `lookup` and `save`. Saving it again updates vocabulary without another first-save event. If connectivity fails, check `.env`, the trusted certificate path, and schema setup in `backend/db/README.md`. Keep TLS verification enabled.

## 4. Pronunciation

Select a short phrase and click **Listen**, then **Slow**. Expect audible Spanish; Slow requests speed 0.7. These calls consume ElevenLabs quota. Repeated identical text/speed requests reuse the backend TTS cache. Check the backend terminal for provider errors.

## 5. Recording and saved feedback

1. Select a phrase or **Practice this line**.
2. Click **Record / Stop**; allow YouTube microphone access in Chrome.
3. Say the selected Spanish text and click again to stop. It automatically stops after 15 seconds.
4. Expect a transcript, intelligibility percentage, and correct/missed/substituted word labels.
5. Expect **Saved to your progress.** A progress-not-saved message means scoring worked but the database write failed.
6. Verify stored feedback:

```sh
curl 'http://localhost:3000/stats/recent?user_id=demo-user&lang=es'
curl 'http://localhost:3000/stats/score-trend?user_id=demo-user&lang=es&days=7'
curl 'http://localhost:3000/stats/trouble-words?user_id=demo-user&lang=es'
```

Recent events and score trend should contain the attempt. Trouble words appear for missed/substituted words; a correct attempt may add none. Scores measure transcription matching, not phonetic accuracy.

For microphone errors, allow YouTube's microphone in Chrome site settings, select the correct device, and reload. Closing the panel, disabling the overlay, or changing videos stops and discards the interrupted recording. Audio is sent for transcription but is not stored in Tiger Data.

## 6. Database regression check

From `backend`, with the existing connection configuration:

```sh
RUN_DB_TESTS=1 "$LL_NODE" --test test/database.test.mjs
```

Or `RUN_DB_TESTS=1 npm run test:db`. It tests real database routes with mocked transcription and rolls back fixture records. It needs network access to Tiger Data. It does not verify real microphone capture or provider audio quality.

## Troubleshooting

| Symptom | First check |
| --- | --- |
| No toolbar | Rebuild, reload extension card, refresh YouTube; check extension errors. |
| Waiting for captions | Use an English-captioned video and turn CC on. If CC says unavailable after a refresh, turn it off and back on. |
| Preparing Spanish captions | Playback pauses until the current captions and four seconds ahead are translated, then resumes automatically. Ollama can take longer than the spoken caption. Turn bilingual captions off to continue in English. |
| Backend connection error | Start localhost:3000; inspect the extension's service worker from its card. |
| Translation/explanation failure | Backend terminal, Gemini key/model/quota. Retry after fixing configuration. |
| Saved phrase missing | `/health/database`, `.env`, trusted certificate path. |
| Speech failure | ElevenLabs key/quota/voice and browser microphone permission. |
| Old code or `[ES]` after changing mode | Reload extension and refresh YouTube. |

Automated checks validate the code and mock HTTP contract. Complete the Chrome, microphone, and real-provider checks before claiming the full user flow works.

## Word clicks

Every word in the extension’s English and Spanish caption rows is clickable and keyboard accessible. Phrase colors remain matching across the rows. Click an uncolored word to check that its contextual translation and short definition appear. Click More detail for grammar, an example and tone. Caption requests pause while the popup is open; a request already in progress may still delay the lookup. While the lookup loads, Save, Listen and Record are disabled. After it succeeds, Save stores the Spanish word or equivalent phrase with its English meaning. Close the popup and press Play when ready to continue.

Rebuild and reload the extension, refresh YouTube, and restart the backend after updating this feature. Word lookups use the selected AI provider; mock mode returns a labelled placeholder instead of a real translation.
