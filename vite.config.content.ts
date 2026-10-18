import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

const resolvePath = (path: string) => fileURLToPath(new URL(path, import.meta.url))

/**
 * Content-script build. MV3 content scripts are classic scripts, so everything
 * (React, panel code, Tailwind CSS as a `?inline` string for the shadow root)
 * is bundled into one IIFE file: dist/content.js.
 *
 * emptyOutDir is false so this build appends to the dist/ produced by
 * vite.config.ts (run order: `vite build && vite build --config vite.config.content.ts`).
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    modulePreload: false,
    // The bundled fonts must travel inside content.js: the shadow root cannot
    // resolve extension-relative asset URLs, so they are inlined as data URIs.
    assetsInlineLimit: 512 * 1024,
    rollupOptions: {
      input: resolvePath('./src/content/index.tsx'),
      output: {
        format: 'iife',
        entryFileNames: 'content.js',
      },
    },
  },
})
