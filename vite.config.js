import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const certPath = join(homedir(), '.config/rxct-certs/rxct.pem')
const keyPath = join(homedir(), '.config/rxct-certs/rxct-key.pem')

const localHttps =
  existsSync(certPath) && existsSync(keyPath)
    ? {
        cert: readFileSync(certPath),
        key: readFileSync(keyPath),
      }
    : undefined

export default defineConfig({
  preview: {
    host: '0.0.0.0',
    port: 4173,
    ...(localHttps ? { https: localHttps } : {}),
  },

  plugins: [
    react(),

    VitePWA({
      registerType: 'autoUpdate',

      includeAssets: [
        'favicon.png',
        'apple-touch-icon.png',
      ],

      manifest: {
        name: 'RxCT',
        short_name: 'RxCT',
        description: 'Your pharmacy learning workspace.',
        background_color: '#164a45',
        theme_color: '#164a45',
display: 'standalone',

        start_url: '/',
        scope: '/',

        icons: [
          {
            src: '/rxct-x-icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/rxct-x-icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/rxct-x-icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },

      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
    }),
  ],
})
