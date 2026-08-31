import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    // Keep the shell fast on mobile by allowing Rolldown to split lazily
    // loaded feature modules (QR scanning, media viewers, and detail routes).
    rolldownOptions: {
      output: {
        codeSplitting: true,
      },
    },
  },
})
