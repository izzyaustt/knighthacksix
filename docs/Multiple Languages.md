# Spanish, French, and Tagalog

English remains the source language and the language of explanations. Choose a learning language:

- **Extension:** open the YouTube sidebar and use **Learning language**. Existing English captions are translated again in the new language; old translation requests cannot replace the new captions. Your choice is saved in Chrome extension settings.
- **Dashboard:** use the language selector in the header. Saved words, activity, scores, resources, and Tutor use that language. Changing language ends an active Tutor session. Your choice is saved for this browser.

Select the same language in both places. These preferences are currently independent; they are not synchronized across browsers or devices.

Saved words and learning events remain separate by language. Existing Spanish data stays under `es`; French uses `fr`, and Tagalog (Filipino) uses `fil`. The database already stores language identifiers, so no schema migration is needed.

## Test each language

1. Reload the extension at `chrome://extensions` and refresh YouTube. Refresh the dashboard too.
2. Open a short video with English captions. Choose **French**, wait for translation, and click a French word and an English word. Both should open the correct translation direction.
3. Try **Listen** and **Listen slowly**. Save a word and check it appears in the dashboard with French selected.
4. Repeat with **Tagalog (Filipino)**, then switch back to Spanish. Saved words and activity should be filtered by the selected language.
5. In **Tutor**, choose the same language in the dashboard header, select a scenario, and start a conversation. The opening should use that language. Real audio sessions need a microphone and use ElevenLabs credits.
6. Change language during a Tutor session and confirm the browser microphone indicator turns off.

For French and Tagalog, pronunciation currently uses audio rather than an English-letter pronunciation guide. The Spanish guide is not used for other languages. Have a fluent speaker review caption translations and voice pronunciation before relying on either language in a demo; small local Ollama models may produce less reliable Tagalog than Gemini.

The live local-model check translated “Hello, my friend” correctly into French but incorrectly into Tagalog. Tagalog captions and definitions are therefore marked preview. The configured Gemini model returned a daily-quota error during verification, so real Gemini Tagalog translation quality is still unverified. The private ElevenLabs agents passed signed-connection checks; real spoken sessions still require a microphone test.

## Automated checks

- `backend/`: `node --test test/languages.test.mjs test/study.test.mjs test/extension-api.test.mjs`
- `extension/`: `node --test test/*.test.mjs`, then `npm run build`
- `dashboard/`: `node --test test/*.test.mjs`, then `npm run build`
- Real configuration checks: `npm run check:study -- fr` and `npm run check:study -- fil` in `backend/`. These issue signed URLs without starting conversations.
- Optional caption provider check: `npm run check:ai -- fr` or `npm run check:ai -- fil`. Ollama runs locally; selecting Gemini uses its API quota. This check prints one real translated line for review.

## Deployment

Keep `shared/` available beside `backend/`, `dashboard/`, and `extension/` in the checkout and deployed backend: all three import the language catalog. Start dashboard/extension builds from this repository layout.

The deployed backend needs `ELEVENLABS_API_KEY` plus the Spanish, French, and Tagalog agent IDs. Reuse the team's configured private agents. The existing Gemini/Ollama environment selection still controls captions and definitions; ElevenLabs Tutor agents use their configured Gemini model independently. Keep all API keys server-side and use HTTPS for the dashboard/backend.

Provider language coverage: [ElevenLabs supported languages](https://elevenlabs.io/docs/help-center/other/what-languages-do-you-support) and [agent language configuration](https://elevenlabs.io/docs/eleven-agents/customization/voice/customization/language).
