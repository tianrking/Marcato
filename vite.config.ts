import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
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
