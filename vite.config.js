import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg', 'logo.png'],
      manifest: {
        name: 'SpotiBot',
        short_name: 'SpotiBot',
        description: 'Sync your lights with Spotify',
        theme_color: '#050505',
        background_color: '#050505',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: 'logo.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'logo.png',
            sizes: '192x192',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  base: '/',
  build: {
    outDir: 'dist-web',
  },
  server: {
    host: '127.0.0.1',
    proxy: {
      '/api/switchbot': {
        target: 'https://api.switch-bot.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/switchbot/, '')
      }
    }
  }
})
