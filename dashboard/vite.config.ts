import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Port 5173 is where the extension's dashboard button points (extension/src/settings.ts).
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
})
