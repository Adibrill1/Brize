import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          maplibre: ['maplibre-gl'],
          anthropic: ['@anthropic-ai/sdk'],
          data: ['dexie', 'pmtiles'],
        },
      },
    },
  },
});
