import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'node:path'

export default defineConfig({
  plugins:[vue()],
  resolve:{ alias:{ 'gexplorer/widgets':path.resolve(process.cwd(),'ExampleWidget_MediaLibrary/preview/widgets-shim.ts') } },
  server:{ host:'127.0.0.1' },
  build:{ outDir:'dist/media-library-preview', assetsInlineLimit:20_000_000, rollupOptions:{ input:'ExampleWidget_MediaLibrary/preview/index.html' } },
})
