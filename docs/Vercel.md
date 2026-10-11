# Free Vercel dashboard + free Render backend

Deploy the backend first using [Render setup](Render.md). Keep Tiger Data as the database. Only the dashboard goes to Vercel.

## Dashboard project settings

Import `izzyaustt/knighthacksix` into a personal Vercel Hobby account. The deployment configuration must be on the branch being deployed. For the public release, merge the deployment changes into `main` first.

| Setting | Value |
| --- | --- |
| Root Directory | Repository root (leave blank) |
| Framework Preset | Other |
| Install Command | `npm ci --prefix dashboard` |
| Build Command | `node dashboard/check-deploy.mjs && npm run build --prefix dashboard` |
| Output Directory | `dashboard/dist` |
| Node.js Version | 24.x |

The root `vercel.json` supplies the commands and SPA rewrite. Keep the repository root available so `dashboard` can import `shared/`. The backend remains a separate Render service.

Before deploying, add these environment variables to Production (and Preview if using previews):

- `VITE_BACKEND_URL`: the actual HTTPS Render backend origin, with no path.
- `VITE_GOOGLE_CLIENT_ID`: the existing Google Web application client ID, matching the backend's `GOOGLE_WEB_CLIENT_ID`.

Both values are public browser configuration. Keep database, Gemini, ElevenLabs, and session credentials only on Render. `.vercelignore` excludes backend files, local environments, certificates, and caches from CLI uploads. Git deployments still rely on keeping secrets out of Git.

Vite embeds these settings when building; redeploy after changing them. Deployment intentionally fails if the backend URL is missing or points to localhost.

## Connect sign-in and the extension

1. Copy the deployed production Vercel URL.
2. Add that exact HTTPS origin to the Google Web OAuth client's **Authorized JavaScript origins**. Retain the localhost origins and existing extension redirect URL.
3. Open the deployed dashboard, sign in, and confirm your saved words and progress load from Render.
4. Build the extension from the repository root with the actual URLs:

```sh
VITE_BACKEND_URL=https://YOUR-API.onrender.com VITE_DASHBOARD_URL=https://YOUR-DASHBOARD.vercel.app npm run build --prefix extension
```

5. Reload the unpacked extension and refresh YouTube. Check saving a word and opening Dashboard on the same account.
6. Test Tutor start/end and feedback on the deployed HTTPS page. This uses ElevenLabs/Gemini quota.

Before a demo, open the Render `/health` endpoint and wait for it to wake. Then check `/health/database`. The Render free backend can sleep even while the Vercel dashboard remains available.

Configuration and local build checks are complete; account access, a real backend URL, and live sign-in/audio tests are still required before claiming deployment is working.

Official reference: [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite).
