import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// The dev server proxies /api to the Fastify backend on :4000.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 'prompt' rather than 'autoUpdate': a till must not reload itself in the
      // middle of a sale, so the user is asked when a new version is ready.
      registerType: 'prompt',
      includeAssets: ['logo.jpeg', 'logo-print.png', 'logo-bw.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Booklab Bookshop',
        short_name: 'Booklab',
        description: 'Point of sale and stock for Booklab Bookshop.',
        start_url: '/pos',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#18181b',
        theme_color: '#b45309',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Sell', short_name: 'Sell', url: '/pos' },
          { name: 'Stock', short_name: 'Stock', url: '/stock' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        // Never let the shell fall back over an API call.
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: ['**/*.{js,css,html,woff2,png,jpeg,svg}'],
        // jspdf and html2canvas push the bundle past the default 2 MiB cap.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Reference data the till needs to sell: catalogue, stock, branches.
            // Network first so a connected till is always current, with the last
            // good copy kept for when it is not.
            urlPattern: ({ url, request }) =>
              request.method === 'GET' &&
              (url.pathname.startsWith('/api/stock/branch/') ||
                url.pathname.startsWith('/api/books') ||
                url.pathname.startsWith('/api/branches') ||
                url.pathname.startsWith('/api/mpesa/config')),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'booklab-reference',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Login-screen slides. The captions change rarely; the pictures are
            // versioned in the URL, so once fetched they never need revalidating
            // and the sign-in screen still looks right on a cold offline start.
            urlPattern: ({ url, request }) => request.method === 'GET' && url.pathname === '/api/promo',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'booklab-promo',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: ({ url, request }) => request.method === 'GET' && /^\/api\/promo\/\d+\/image$/.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'booklab-promo-images',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'booklab-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
});
