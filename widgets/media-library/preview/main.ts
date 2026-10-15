import { createApp } from 'vue'
import App from './App.vue'

createApp(App)
  .provide('widgetSdk', { ui:() => ({ snack:async () => ({ reason:'timeout' }) }) })
  .mount('#app')
