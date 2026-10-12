import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'node:path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      'gexplorer/widgets': path.resolve(
        process.cwd(),
        'ExampleWidget_Weather/preview/widgets-shim.ts',
      ),
    },
  },
  server: { host: '127.0.0.1' },
})
