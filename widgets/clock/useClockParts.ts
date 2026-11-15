import { onMounted, ref, type Ref } from 'vue'
import type { PartProvider, WidgetSdk } from 'gexplorer/widgets'

/** The key Clock saves for a provider (the same `type::point` as the older slot keys, so saved layouts carry over). */
export const partKey = (provider: Pick<PartProvider, 'type' | 'point'>) => `${provider.type}::${provider.point}`

/**
 * The providers of one of Clock's points (entry.ts consumes), read once when Clock mounts (GEM Shell 2026-11-15:
 * sdk.parts().list). A widget installed later shows after Clock reloads.
 */
export function useClockParts(sdk: WidgetSdk | undefined, point: string): Ref<readonly PartProvider[]> {
  const providers = ref<readonly PartProvider[]>([])
  onMounted(async () => {
    const parts = sdk?.parts?.()
    if (!parts) { console.warn(`[clock] ${point}: this GEM Shell has no sdk.parts(), so no providers are listed.`); return }
    try { providers.value = await parts.list(point) }
    catch (err) { console.error(`[clock] ${point}: listing its providers failed`, err) }
  })
  return providers
}
