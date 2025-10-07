import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js'
import enforceScopedStyles from './tools/enforceScopedStyles'

// Where to write the single-file output.
// Example (Windows):
//   set OUTPUT_DIR=C:\path\to\GExplorer\UserInterface\public\runtime-widgets\my-widget
const OUT = process.env.OUTPUT_DIR || 'dist'

// Single-file, externalize host imports (/src/...); keep filename index.js
export default defineConfig({
  plugins: [enforceScopedStyles(), vue(), cssInjectedByJsPlugin()],
  build: {
    outDir: OUT,
    emptyOutDir: false,
    cssCodeSplit: false,
    sourcemap: false,
    lib: {
      entry: 'src/entry.ts',
      formats: ['es'],
      fileName: () => 'index'
    },
    rollupOptions: {
      external: (id) => id.startsWith('/src/'), // leave host modules for runtime
      output: {
        entryFileNames: 'index.js',
        assetFileNames: 'index.[ext]'
      }
    }
  }
})
