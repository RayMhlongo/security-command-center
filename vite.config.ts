import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Security Command Center',
        short_name: 'Command Center',
        description: 'Unified operations dashboard for DRS and Big 5 Security.',
        theme_color: '#1a2f5f',
        background_color: '#0d1a36',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon.svg', sizes: '512x512', type: 'image/svg+xml' },
          { src: '/icon.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' }
        ]
      }
    })
  ]
});
