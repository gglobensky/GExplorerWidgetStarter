import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import cssInjectedByJs from 'vite-plugin-css-injected-by-js'

export default defineConfig({
  plugins:[vue(),cssInjectedByJs()],
  build:{
    target:'es2020', outDir:'dist/runtime-widgets/media-library', emptyOutDir:true,
    cssCodeSplit:false, assetsInlineLimit:20_000_000,
    lib:{ entry:'ExampleWidget_MediaLibrary/entry.ts', formats:['es'], fileName:()=>'index.js' },
    rollupOptions:{ external:['vue','gexplorer/widgets'], output:{ paths:{ vue:'/runtime/vue.js', 'gexplorer/widgets':'/runtime/vue.js' } } },
  },
})
