import { createApp } from 'vue'
import App from './App.vue'
function tooltipText(value: string | { content?: string; detail?: string } | undefined) {
  if (!value) return ''
  if (typeof value === 'string') return value
  return [value.content, value.detail].filter(Boolean).join('\n')
}
createApp(App)
  // Preview stand-in only; the real shell owns and renders this directive.
  .directive('gex-tooltip', {
    mounted(el, binding) { el.title = tooltipText(binding.value) },
    updated(el, binding) { el.title = tooltipText(binding.value) },
  })
  .mount('#app')
