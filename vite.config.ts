import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

const resolvePath = (path: string) => fileURLToPath(new URL(path, import.meta.url))

/**
 * Main extension build: service worker (ES module) + options page (index.html).
 * The content script has its own config (vite.config.content.ts) because MV3
 * content scripts must be classic scripts: a single IIFE file with no imports.
 * `public/` (manifest.json, icons) is copied to dist/ by this build.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        options: resolvePath('./index.html'),
        background: resolvePath('./src/background/index.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
})
