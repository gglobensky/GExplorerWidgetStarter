<script setup lang="ts">
import { inject, onBeforeUnmount, onMounted, ref } from 'vue'
import type { PartProvider, TerminalPartHandle, WidgetSdk } from 'gexplorer/widgets'

/**
 * Where another widget's part shows in Clock (a complication, a calendar panel). GEM Shell draws it over this box from
 * the provider's own code (sdk.parts().mount); it is never in Clock's own tree. When GEM Shell can't show it, the
 * reason is shown here instead.
 */
const props = defineProps<{ point: string; provider: PartProvider }>()
const sdk = inject<WidgetSdk>('widgetSdk')
const box = ref<HTMLElement | null>(null)
const problem = ref('')
let handle: TerminalPartHandle | null = null
let gone = false

onMounted(async () => {
  const parts = sdk?.parts?.()
  if (!parts || !box.value) { problem.value = 'This GEM Shell can\'t show other widgets\' parts.'; return }
  const r = await parts.mount(box.value, props.point, props.provider.type)
  if (gone) { if (r.ok) r.part.close(); return }
  if (r.ok) handle = r.part
  else problem.value = r.error
})
onBeforeUnmount(() => { gone = true; handle?.close(); handle = null })
</script>

<template>
  <div ref="box" class="part-slot" :data-point="point">
    <p v-if="problem" class="part-problem"><b>{{ provider.label || provider.name }}</b> {{ problem }}</p>
  </div>
</template>

<style scoped>
.part-slot { position: relative; min-height: 2em; }
.part-problem { margin: 0; font-size: .85em; opacity: .75; }
</style>
