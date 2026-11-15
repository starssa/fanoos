import { defineConfig, type Plugin } from 'vite';

// TV web runtimes load the app from file:// and old Chromium (Tizen 2017 = Chrome 47,
// webOS 4 = Chrome 53) can't load ES modules from file://. So we ship one classic
// IIFE bundle and strip type="module" from index.html.
export function classicScript(): Plugin {
  return {
    name: 'classic-script',
    apply: 'build',
    enforce: 'post',
    transformIndexHtml(html) {
      return html.replace(/<script type="module" crossorigin/g, '<script defer').replace(/ crossorigin/g, '');
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [classicScript()],
  worker: { format: 'iife' },
  build: {
    target: 'es2015',
    // CSS for old TV browsers too: without this the minifier writes "inset:0" (Chrome 87+) for top/left/right/bottom,
    // and on Tizen 5.5 (Chrome 69) the player became a 300×150 box below the page.
    cssTarget: ['chrome47', 'safari10'],
    outDir: 'dist',
    modulePreload: false,
    chunkSizeWarningLimit: 1000, // hls.js is most of the bundle
    cssCodeSplit: false,
    rollupOptions: { output: { format: 'iife', inlineDynamicImports: true } },
  },
});
