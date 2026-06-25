import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      'wavedrom-render-any': fileURLToPath(new URL('./node_modules/wavedrom/lib/render-any.js', import.meta.url)),
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.jpg', 'github.png', 'sample.md', 'robots.txt', 'sitemap.xml'],
      manifest: false,
      workbox: {
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,webmanifest,md}'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.protocol === 'http:' || url.protocol === 'https:',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'md-preview-local' },
          },
          {
            urlPattern: /^https:\/\/api\.github\.com\//,
            handler: 'NetworkFirst',
            options: { cacheName: 'md-preview-github', networkTimeoutSeconds: 8 },
          },
        ],
      },
    }),
  ],
})
