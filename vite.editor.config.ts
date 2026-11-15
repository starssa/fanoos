import { defineConfig } from 'vite';
import { classicScript } from './vite.config';

// Fanoos Addon Studio (PWA). Built as one classic script (not an ES module) so index.html also
// works opened straight from a folder (file://): Firefox and Chrome refuse module scripts there.
export default defineConfig({
  root: 'editor',
  base: './',
  publicDir: 'public',
  plugins: [classicScript()],
  worker: { format: 'iife' },
  build: {
    outDir: '../dist-editor',
    emptyOutDir: true,
    target: 'es2019',
    modulePreload: false,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 1500,
    rollupOptions: { output: { format: 'iife', inlineDynamicImports: true } },
  },
});
