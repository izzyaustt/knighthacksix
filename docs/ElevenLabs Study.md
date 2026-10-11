# Spanish conversation practice

Open the dashboard, sign in, and select **Study → Tutor**. Choose a conversation (café, meeting someone, or a day out) and your Spanish level. Click **Start conversation**, allow microphone access, and answer Luna in Spanish. You can ask for help in English, say “¿Puedes repetir?” or “Más despacio, por favor.”

The page shows a live transcript and offers mute/unmute and end controls. Each session lasts up to three minutes. Leaving Tutor or signing out ends the connection. Transcripts are displayed for the current session; they are not saved to the langtube database. The coach can use your five most recently saved Spanish words.

## Setup for teammates

1. Run `npm install` in both `backend/` and `dashboard/`.
2. Set `ELEVENLABS_API_KEY` and `ELEVENLABS_AGENT_ID` in the backend environment. Get the existing project agent ID from the team; reuse it rather than creating another agent. Keep the API key out of dashboard variables and Git.
3. To create an agent for a separate ElevenLabs account, run `npm run setup:study` in `backend/`. This creates a private coach and saves its ID to the ignored `backend/.env`. Running it again reuses an already configured ID. Its instructions and settings are in `backend/study-agent-config.mjs`; editing that file does not update an existing remote agent.
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

## Deployment

Deploy the dashboard over HTTPS so microphone access works. Set its build-time `VITE_BACKEND_URL` to the deployed HTTPS backend. Configure that backend with `ELEVENLABS_API_KEY`, the same private `ELEVENLABS_AGENT_ID`, and the existing database/Google authentication variables. Allow the dashboard origin through the backend’s CORS configuration and Google’s authorized origins.

The browser requests a short-lived signed conversation URL from the authenticated backend. It connects directly to ElevenLabs for audio; the API key stays on the server. Agent voice recording is disabled; ElevenLabs still processes audio and may retain conversation transcripts under the account’s configured retention policy.
