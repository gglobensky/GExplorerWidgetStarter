<script setup lang="ts">
import { ref, computed } from '/runtime/vue.js'
import { networkFetch } from '/src/widgets/net'

const props = defineProps<{
  sourceId: string
  config?: { data?: any; view?: any }
  theme?: Record<string, string>
  placement?: {  // ← NEW
    context: 'grid' | 'sidebar' | 'embedded'
    size: { cols?: number; rows?: number }
  }
}>()

const result = ref<string>('Click "Fetch Weather" to load forecast')
const loading = ref(false)

// Adapt layout based on context
const isCompact = computed(() => props.placement?.context === 'sidebar')
// Scale factor based on grid size
const scale = computed(() => {
  const cols = props.placement?.size?.cols || 2
  const rows = props.placement?.size?.rows || 2
  
  // Small (2x2) = 1.0, Medium (3x3) = 1.2, Large (4x4) = 1.5
  return Math.min(1.5, 0.8 + (cols / 5))
})

async function fetchWeather() {
  loading.value = true
  result.value = 'Loading...'
  
  try {
    const location = props.config?.data?.location || 'TOP/31,80'
    const url = `https://api.weather.gov/gridpoints/${location}/forecast`
    const response = await networkFetch('weather', props.sourceId, url) // widgetType, widgetId
    
    const data = await response.json()
    
    if (data.properties && data.properties.periods) {
      const periods = data.properties.periods.slice(0, isCompact.value ? 1 : 3)
      result.value = periods.map((p: any) => 
        `${p.name}: ${p.shortForecast}\n${p.temperature}°${p.temperatureUnit}`
      ).join('\n\n')
    } else {
      result.value = JSON.stringify(data, null, 2)
    }
  } catch (err: any) {
    result.value = `Error: ${err.message}`
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="weather-root" :style="{ 
    fontSize: `${scale}em`,
    padding: `${12 * scale}px`
  }">
    <div class="header">
      <h3>Weather</h3>
      <button @click="fetchWeather" :disabled="loading" class="fetch-btn">
        {{ loading ? '...' : '↻' }}
      </button>
    </div>
    
    <pre class="result">{{ result }}</pre>
  </div>
</template>

<style scoped>
.weather-root {
  padding: 12px;
  background: var(--surface-1, #222);
  border-radius: 8px;
  color: var(--fg, #eee);
  height: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.weather-root.compact {
  padding: 8px;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.weather-root.compact .header {
  margin-bottom: 6px;
}

h3 {
  margin: 0;
  font-size: 0.9em;
  font-weight: 600;
}

.fetch-btn {
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid var(--border, #555);
  background: var(--surface-2, #333);
  color: inherit;
  cursor: pointer;
  font-size: 0.9em;
}

.fetch-btn:hover:not(:disabled) {
  background: var(--surface-3, #444);
}

.result {
  flex: 1;
  white-space: pre-wrap;
  font-family: monospace;
  font-size: 0.85em;
  line-height: 1.4;
  margin: 0;
  overflow-y: auto;
}
</style>