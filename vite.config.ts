import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import cssInjectedByJs from 'vite-plugin-css-injected-by-js'
import fs from 'node:fs'
import path from 'node:path'

// Load per-widget build knobs
const cfgPath = path.resolve(process.cwd(), 'widget.build.json')
const cfg = fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, 'utf-8')) : {}

const widgetType = process.env.WIDGET_TYPE || cfg.widgetType || 'hello'
const outPublic = process.env.OUTPUT_PUBLIC_DIR || cfg.outputPublicDir || ''
const outDir = path.join(outPublic, 'runtime-widgets', widgetType)

// Detect watch mode (so we don't drop console in dev/watch)
const isWatch = process.argv.includes('--watch') || process.env.WATCH === 'true'

// Sourcemap toggle (env overrides file)
const sourceMap =
  process.env.SOURCEMAP ? process.env.SOURCEMAP === 'true' : Boolean(cfg.sourcemap)

// Helper: mark host-resolved imports as external
function isHostExternal(id: string) {
  return (
    id === 'vue' ||
    id === '/runtime/vue.js' ||
    id.startsWith('/src/') ||
    id.startsWith('/runtime/')
  )
}

export default defineConfig({
  plugins: [
    vue(),
    cssInjectedByJs(),
    // (Keep your scoped-style enforcement plugin if you have it)
    // enforceScopedStyles()
  ],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    globalThis: 'window',
  },
  build: {
    target: 'es2020',
    sourcemap: sourceMap,
    minify: 'esbuild',
    cssCodeSplit: false,
    outDir,
    emptyOutDir: true,
    assetsDir: '.',
    lib: {
      entry: path.resolve(process.cwd(), 'src/entry.ts'),
      formats: ['es'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
      // Do not bundle the host or vue — they’re provided at runtime
      external: (id) => isHostExternal(id),
      output: {
        // Re-map 'vue' to the host shim URL in case an author imports 'vue'
        paths: {
          vue: '/runtime/vue.js',
        },
      },
    },
    esbuild: {
      // Keep console in watch/dev; strip in release builds
      drop: isWatch ? [] : ['console', 'debugger'],
    },
  },
})
