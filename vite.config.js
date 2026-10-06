import { defineConfig } from 'vite';
export default defineConfig({
  base: './',                       // works from any folder / subpath
  build: { chunkSizeWarningLimit: 1500 }
});
