import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  server: { host: '0.0.0.0', port: 8095 },
  // no-store so a stale cached index.html can never point at dead hashed bundles
  preview: { host: '0.0.0.0', port: 8095, headers: { 'Cache-Control': 'no-store' } }
})
