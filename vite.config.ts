import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version?: string }

function gitValue(command: string, fallback = '') {
  try {
    return execSync(command, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || fallback
  }
  catch {
    return fallback
  }
}

const commitSha = process.env.VERCEL_GIT_COMMIT_SHA || gitValue('git rev-parse HEAD')
const commitRef = process.env.VERCEL_GIT_COMMIT_REF || gitValue('git branch --show-current', 'local')

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version || '0.0.0'),
    __APP_COMMIT_SHA__: JSON.stringify(commitSha),
    __APP_COMMIT_REF__: JSON.stringify(commitRef),
    __APP_BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
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
        globPatterns: [
          'index.html',
          'assets/index-*.js',
          'assets/index-*.css',
          '*.{ico,png,svg,jpg,webmanifest,md}',
        ],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.protocol === 'http:' || url.protocol === 'https:',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'marcato-local' },
          },
          {
            urlPattern: /^https:\/\/api\.github\.com\//,
            handler: 'NetworkFirst',
            options: { cacheName: 'marcato-github', networkTimeoutSeconds: 8 },
          },
        ],
      },
    }),
  ],
})
