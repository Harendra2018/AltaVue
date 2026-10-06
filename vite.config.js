import { defineConfig } from 'vite';

export default defineConfig({
  base: '/AltaVue/',   // must match the GitHub repo name (case-sensitive)
  build: { chunkSizeWarningLimit: 1500 }
});
