import fs from 'node:fs'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Dev server proxies the API to the FastAPI backend (backend, port 8772; FPX_API_PORT for another one)
const apiPort = process.env.FPX_API_PORT ?? '8772'
// the app version lives only in the desktop app config (also used by the release workflow)
const tauriConfig = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../desktop/src-tauri/tauri.conf.json'), 'utf-8'))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: { __APP_VERSION__: JSON.stringify(tauriConfig.version) },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: { port: 5176, proxy: { '/api': `http://127.0.0.1:${apiPort}` } },
  build: { chunkSizeWarningLimit: 1500 },
})
