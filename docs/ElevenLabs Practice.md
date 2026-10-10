# ElevenLabs listening and speaking practice

## Try it in Chrome

1. Restart the backend from `backend` with `npm run start:ollama` (local translation) or `npm run start:gemini` (demo translation). Both use the real ElevenLabs audio service when its server API key is configured.
2. From `extension`, run `npm run build`. In `chrome://extensions`, reload the unpacked extension, then refresh the YouTube tab.
3. Pause a video with translated captions and click a word or phrase. Wait for the Spanish text to appear.
4. Read the **Say it** guide below the Spanish text: for example, `hola` → `OH-lah` or `minutos` → `mee-NOO-tohs`. Hyphens split syllables and capitals mark stress. This uses approximate English spelling; the audio demonstrates the exact sounds. Selecting an English word shows the pronunciation of its Spanish translation. The guide comes from consistent Spanish spelling, syllable, and stress rules, not generated AI text. It appears immediately for Spanish text and after translation for an English lookup, with no pronunciation request or audio credits. Example: `hice` → `EE-seh`, syllables `HI-ce`; the h is silent and the e uses a short eh sound. Sound tips explain special letters. Exceptional names, acronyms and recognized foreign words are marked `(listen)` instead of guessing. This Latin American guide is an approximation, not an accent assessment or a dictionary of every exception.
5. Select **Listen**, then **Listen slowly**. Both should pronounce the Spanish text. **Stop audio** stops playback; repeat plays reuse audio. Rapidly switching buttons should play only the latest selection.
6. Select **Record yourself**. Allow microphone access for YouTube when Chrome asks, speak the Spanish text, then select **Stop recording**. Recording stops automatically after 15 seconds. Listen buttons are disabled while recording or checking, to avoid recording the reference voice.
7. Compare **Heard** with the target. Green checks show recognized words; amber retry markers show missed or substituted words. Hover over a marker for what was heard instead. Use **Play my recording** to compare your voice with the reference, then record again.
8. Close the popup during recording to check that the microphone stops. Deny microphone access or disconnect the provider to check the error messages and retry controls.

The percentage measures target words recognized in the transcript. It does not measure accent quality or individual sounds. Accent marks are tolerated, but Spanish `ñ` remains distinct from `n`. If no speech is detected, the attempt fails with a retry message instead of saving a misleading zero score.

## Configuration and deployment

Keep `ELEVENLABS_API_KEY` in the backend environment only. `ELEVENLABS_VOICE_ID` selects a voice available to the account; choose a Spanish voice with the accent you want to teach and listen to samples before the demo. The existing voice remains the fallback.

`ELEVENLABS_TTS_MODEL=eleven_flash_v2_5` is the default for responsive practice. Set it to `eleven_multilingual_v2` for more expressive delivery, then restart the backend and refresh YouTube. Model, voice, Spanish language, speed, and voice settings are included in server cache keys. Normal and slow audio are separate generations; simultaneous requests for the same audio share one generation per backend process. The browser retains up to 32 audio requests per page session.

TTS times out after 30 seconds; transcription after 60 seconds. Raw recordings remain in browser memory for playback and are sent to ElevenLabs through the backend for transcription. The application stores transcript/score progress, rather than raw microphone recordings. ElevenLabs has its own data handling policy. Closing or replacing the popup releases its audio URL and microphone tracks.

This works with a hosted HTTPS backend and does not require Ollama for audio. The backend `.cache/tts` directory should be writable. If disk caching is unavailable, generated audio still plays. Disk caches are per server and can reset on deployment; use shared storage for caching across replicas. Gemini/Ollama selection controls translation and definitions, independently of ElevenLabs.

## Automated checks

Use Node 24. From `backend`, run `node --test test/elevenlabs.test.mjs` and `npm run typecheck`. From `extension`, run `node --test test/*.test.mjs` and `npm run build`.

Provider tests use fake audio responses and do not consume ElevenLabs credits. Real voice quality, microphone capture and end-to-end transcription need the Chrome steps above. Real **Listen** and **Record** actions use the account's ElevenLabs allowance; translation mock mode does not mock ElevenLabs.

API references: [Create speech](https://elevenlabs.io/docs/api-reference/text-to-speech/convert), [Create transcript](https://elevenlabs.io/docs/api-reference/speech-to-text/convert).

Pronunciation rule references: [Spanish letter sounds](https://www.spanishdict.com/guide/spanish-alphabet-pronunciation), [Spanish vowels](https://www.spanishdict.com/guide/spanish-vowels), and [RAE stress conventions](https://www.rae.es/dpd/tilde). The same pure rule module is bundled into the extension and used by the backend; it has no local-service dependency. Regression checks: `node --test test/spanish-pronunciation.test.mjs test/word-explanation.test.mjs` from `backend`.
