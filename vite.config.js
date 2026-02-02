import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/Spotibot/', // GitHub Pages repository name
  server: {
    host: '127.0.0.1',
    proxy: {
      '/api/switchbot': {
        target: 'https://api.switch-bot.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/switchbot/, '')
      }
      // Spotify proxy removed for Implicit Grant Flow
    }
  }
})
