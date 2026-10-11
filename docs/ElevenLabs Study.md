# Conversation practice

Open the dashboard, sign in, choose a language in the header, and select **Study → Tutor**. Choose a conversation (café, meeting someone, or a day out) and your Spanish level. Click **Start conversation**, allow microphone access, and answer Luna in your selected language. You can ask for help in English, say “¿Puedes repetir?” or “Más despacio, por favor.”

The page shows a live transcript and offers mute/unmute and end controls. Each session lasts up to three minutes. Leaving Tutor or signing out ends the connection. The coach can use your five most recently saved words in the selected language.

After End or the three-minute limit, Tutor reviews the transcript using the backend's configured AI provider (`AI_PROVIDER=ollama` for local testing, `AI_PROVIDER=gemini` for deployment). It gives a practice rating out of 100, with understanding, relevance, vocabulary, and grammar each rated 0–5 relative to your selected level. This is transcript feedback, not a pronunciation rating or formal proficiency assessment. At least two replies to Luna are required. Asking for repetition or English help should not be treated as an irrelevant answer.

When an exchange shows a clear vocabulary gap, feedback lists up to five words or short expressions, the relevant question/reply, a reason, and a better example reply. These are automatically saved in your selected-language vocabulary with `learning` status; existing words are marked for refresh. Rating and feedback excerpts are saved together as a `review` learning event. The full transcript is sent for analysis but is not stored in the langtube database. Retry uses the same review ID to avoid duplicate saved results. Review scores remain separate from the dashboard's pronunciation chart.

## Setup for teammates

1. Run `npm install` in both `backend/` and `dashboard/`.
2. Set `ELEVENLABS_API_KEY` and `ELEVENLABS_AGENT_ID` in the backend environment. Get the existing project agent ID from the team; reuse it rather than creating another agent. Keep the API key out of dashboard variables and Git.
3. To create an agent for a separate ElevenLabs account, run `npm run setup:study` in `backend/`. This creates a private coach and saves its ID to the ignored `backend/.env`. For French use `npm run setup:study -- fr`; for Tagalog use `npm run setup:study -- fil`. Their IDs are stored in `ELEVENLABS_AGENT_ID_FR` and `ELEVENLABS_AGENT_ID_FIL`. Running it again reuses an already configured ID. Its instructions and settings are in `backend/study-agent-config.mjs`; editing that file does not update an existing remote agent.
4. Configure the existing Google login environment and set `VITE_BACKEND_URL` in `dashboard/.env` to your backend address. Restart the backend after changing its environment, then run `npm run dev` in `dashboard/`.

## Check that it works

- In `backend/`, run `npm run test:study`. These tests mock ElevenLabs and do not use conversation credits.
- Run `npm run check:study` in `backend/` to verify that the real private Spanish agent is configured and can issue a signed URL. This starts no voice session.
- In `dashboard/`, run `npm run build` to verify the production build.
- Sign in and open Study → Tutor. All three scenarios should appear and Start should be enabled.
- Start a session, allow your microphone, and say “Hola, quiero un café.” Luna should respond, and both turns should appear in the transcript. Live sessions use your ElevenLabs account’s conversation allowance.
- Mute and confirm the coach cannot hear new speech. Unmute to continue. End the session, then start another one to check reconnection.
- Navigate back to Study or Dashboard during a session: the browser microphone indicator should turn off. Repeat using Sign out.
- Deny microphone permission and check the page shows a useful error with a working retry button.
- For feedback, choose Spanish → café → A1. Answer a drink question with an unrelated response such as “Vivo en Nueva York,” then give another reply and press End. Expect feedback referencing the actual exchange and relevant drink vocabulary; exact scores/words vary by model. Open Dashboard to check that recommended words appear in the vocabulary list within five seconds.
- Try a relevant conversation with no vocabulary difficulty; the review may correctly suggest no words. Ask Luna to repeat and verify it is not penalized as an unrelated response.
- End without speaking: expect guidance to try two replies, with no numerical score or saved words. Stop the local AI server and end a conversation: expect a retry button. Restart it and retry; the rating and vocabulary should save once.

## Deployment

Deploy the dashboard over HTTPS so microphone access works. Set its build-time `VITE_BACKEND_URL` to the deployed HTTPS backend. Configure that backend with `ELEVENLABS_API_KEY`, the private agent IDs for each enabled language (`ELEVENLABS_AGENT_ID`, `ELEVENLABS_AGENT_ID_FR`, and `ELEVENLABS_AGENT_ID_FIL`), and the existing database/Google authentication variables. Allow the dashboard origin through the backend’s CORS configuration and Google’s authorized origins.

Set `AI_PROVIDER=gemini`, `GEMINI_API_KEY`, and a supported `GEMINI_MODEL` on the deployed backend for conversation feedback. The same review route runs against Ollama locally; it never silently switches providers. No database migration is needed for this feedback feature. Keep AI keys on the backend.

The local Qwen 3B smoke test showed inconsistent ratings and word suggestions. Dialogue references and suggested vocabulary are validated before saving, but these checks do not guarantee semantic accuracy. Test the intended demo model with relevant replies, unrelated replies, and requests for help before presenting its ratings. A live end-to-end voice conversation and Gemini feedback have not yet been verified for this feature.

The browser requests a short-lived signed conversation URL from the authenticated backend. It connects directly to ElevenLabs for audio; the API key stays on the server. Agent voice recording is disabled; ElevenLabs still processes audio and may retain conversation transcripts under the account’s configured retention policy.
