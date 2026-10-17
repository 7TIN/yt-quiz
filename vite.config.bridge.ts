import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const resolvePath = (path: string) => fileURLToPath(new URL(path, import.meta.url))

/**
 * Builds the MAIN-world transcript bridge (dist/transcript-bridge.js).
 * No React/Tailwind here: it is a tiny classic script declared in the manifest
 * with "world": "MAIN" so it can read the page's player response and fetch
 * caption tracks from the page's own origin.
 *
 * emptyOutDir is false: this build appends to the dist/ produced by the other two.
 */
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    modulePreload: false,
    rollupOptions: {
      input: resolvePath('./src/content/transcript-bridge.ts'),
      output: {
        format: 'iife',
        entryFileNames: 'transcript-bridge.js',
      },
    },
  },
})
