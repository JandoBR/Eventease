// frontend/vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: [
      'eventease.pixxula.uk'
    ],
    proxy: {
      '/api': 'http://localhost:25000',
    },
  }
})
