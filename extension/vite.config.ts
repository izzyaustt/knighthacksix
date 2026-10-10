import { defineConfig, loadEnv } from 'vite'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.json' with { type: 'json' }

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env };
  const backend = env.VITE_BACKEND_URL ? new URL(env.VITE_BACKEND_URL) : null;
  if (backend && (backend.protocol !== 'https:' || backend.username || backend.password || backend.search || backend.hash || backend.pathname !== '/')) {
    throw new Error('VITE_BACKEND_URL must be an HTTPS origin, such as https://api.example.com');
  }
  return {
  plugins: [crx({ manifest: { ...manifest, host_permissions: [...manifest.host_permissions, ...(backend ? [`${backend.origin}/*`] : [])] } })],
  server: {
    cors: { origin: [/chrome-extension:\/\/.+/] },
  },
  };
})
