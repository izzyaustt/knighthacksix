# Deploy the backend on free Render

Use a Render **Web Service** for the backend and [Vercel](Vercel.md) for the dashboard. Keep the existing Tiger Data database. This setup uses Gemini in production; Ollama stays on your laptop. The ElevenLabs Tutor still connects directly from the browser using a signed URL issued by the backend.

## 1. Get these files onto GitHub

Commit the deployment changes on `kamilla`, push them, and merge the PR into `main`. Render reads GitHub, not your local files. The `render.yaml` blueprint targets `main`. Do not commit `.env` files or certificates.

## 2. Create the backend first

In https://dashboard.render.com choose **New → Web Service**, connect `izzyaustt/knighthacksix`, and select:

| Setting | Value |
| --- | --- |
| Branch | `main` |
| Root directory | Leave blank |
| Runtime | Docker |
| Dockerfile path | `backend/Dockerfile` |
| Docker build context | Repository root (`.`) |
| Instance type | Free |
| Health check path | `/health` |

The root directory is essential: both backend and dashboard import `shared/`.

Set the following on the backend's **Environment** page. Copy secret values from your ignored local backend environment directly into Render; don't paste them into GitHub or dashboard settings.

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `HOST` | `0.0.0.0` |
| `AI_PROVIDER` | `gemini` |
| `MOCK` | `0` |
| `DATABASE_URL` | Existing Tiger Data PostgreSQL connection string |
| `SESSION_SECRET` | New random secret (`openssl rand -hex 32`) |
| `GOOGLE_WEB_CLIENT_ID` | Your Google Web application client ID |
| `GOOGLE_EXTENSION_CLIENT_ID` | Existing extension OAuth client ID |
| `GEMINI_API_KEY` | Your Gemini key |
| `GEMINI_MODEL` | Model verified to work with your account and available quota |
| `ELEVENLABS_API_KEY` | Your ElevenLabs key |
| `ELEVENLABS_AGENT_ID` | Existing Spanish Tutor agent ID |
| `ELEVENLABS_AGENT_ID_FR` | Existing French agent ID, if enabling French Tutor |
| `ELEVENLABS_AGENT_ID_FIL` | Existing Tagalog agent ID, if enabling Tagalog Tutor |

Let Render supply `PORT`. Do not copy `AI_PROVIDER=ollama`, localhost URLs, `MOCK=1`, or a Mac certificate path into Render.

If your Tiger Data setup needs the CA certificate, add a **Secret File** named `tiger-ca.pem` using the contents of your existing certificate. Set `PGSSLROOTCERT=/etc/secrets/tiger-ca.pem`. Remove any Mac-only `sslrootcert` query parameter from the connection string, since it overrides `PGSSLROOTCERT`. Certificate verification remains enabled. If Tiger Data has network restrictions, allow this service's outbound IP addresses.

Deploy, copy the actual HTTPS service URL, then open:

- `<backend-url>/health`: should report `ok: true` and `ai.provider: gemini`.
- `<backend-url>/health/database`: should report `database: connected`.

These health checks do not call Gemini or start a paid voice session. They do not prove the AI account has quota; test a real caption and a word lookup before the demo.

## 3. Deploy the dashboard on Vercel

Follow [Vercel setup](Vercel.md) using the actual Render HTTPS backend URL. Add the production Vercel origin to the Google Web OAuth client, then test sign-in and Tutor.

## 4. Point the extension at both hosted services

Build from the repository root, replacing the two sample origins with the actual URLs:

```sh
VITE_BACKEND_URL=https://YOUR-API.onrender.com VITE_DASHBOARD_URL=https://YOUR-DASHBOARD.vercel.app npm run build --prefix extension
```

Reload the extension at `chrome://extensions`, then refresh YouTube. Save a word in the sidebar, open Dashboard, and check that the same signed-in account sees it. The hosted extension should work with your local backend stopped.

If using the interactive extension OAuth flow, retain its existing Chrome extension redirect URL in the Google Web client. Changing unpacked extension identity can change that URL; do not replace the extension ID during this deployment.

## Blueprint alternative

`render.yaml` describes the free backend only. After it is on `main`, use **New → Blueprint** instead of creating the backend manually. Do not create duplicates. Supply the prompted environment values, add the CA secret file separately if required, and add the optional French and Tagalog agent variables. Deploy the dashboard separately on Vercel.

## Free hosting behavior

Render's free backend sleeps after 15 idle minutes and can take about a minute to wake. Open `/health` and wait for it to respond before demonstrating the app. The static dashboard stays available, but API calls can fail or wait while the backend wakes. The backend caption/audio cache is temporary and can reset on restart; learning data remains in Tiger Data.

Free hosting does not make Gemini or ElevenLabs usage free. Their quotas still apply. The deployment code never falls back to a different paid provider automatically.

## Verification status

Local dashboard build and deployment configuration checks are verifiable without publishing. The Dockerfile includes `backend/` and `shared/` and excludes local credentials through the root `.dockerignore`. A container build and live hosted login/audio/database tests still need to pass on Render; a running local Docker daemon was not available during preparation.

Official references: [free hosting](https://render.com/docs/free), [Blueprint configuration](https://render.com/docs/blueprint-spec), [environment variables and secret files](https://render.com/docs/configure-environment-variables).
