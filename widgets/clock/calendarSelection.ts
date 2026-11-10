export type CalendarSelection = { kind: 'local' } | { kind: 'data'; key: string } | { kind: 'panel'; key: string }
type ProviderIdentity = { key: string; widgetType: string }
type PanelIdentity = { key?: string; id?: string; widgetType: string }

/** Pure provider policy kept separate from Vue and the widget SDK so it can be tested in isolation. */
export function resolveCalendarSelection(preference: string, data: readonly ProviderIdentity[], panels: readonly PanelIdentity[]): CalendarSelection {
  if (preference === 'local') return { kind: 'local' }
  const requestedData = preference.startsWith('data:') ? preference.slice(5) : preference
  const dataProvider = preference === 'latest'
    ? data[data.length - 1]
    : data.find(provider => provider.widgetType === preference || provider.key === requestedData)
  if (dataProvider) return { kind: 'data', key: dataProvider.key }
  const requestedPanel = preference.startsWith('panel:') ? preference.slice(6) : preference
  const unmatched = panels.filter(panel => !data.some(provider => provider.widgetType === panel.widgetType))
  const panel = preference === 'latest'
    ? unmatched[unmatched.length - 1]
    : panels.find(provider => provider.widgetType === preference || (provider.key || provider.id) === requestedPanel)
  return panel ? { kind: 'panel', key: String(panel.key || panel.id) } : { kind: 'local' }
}
