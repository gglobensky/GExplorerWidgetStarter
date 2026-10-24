// widgets/gesture-test/entry.ts
//
// TEMPORARY (2026-10-24, release plan B2): the gesture-refusal test. Each button calls a view-moving SDK
// method now or later, and shows what the shell answered. Delete this folder (and
// <shell>/UserInterface/public/runtime-widgets/gesture-test) once the test is done.
import Widget from './Widget.vue'

export default {
  api: '1.0',
  id: 'gesture-test',
  version: '0.0.1',
  license: 'PolyForm-Noncommercial-1.0.0',
  Component: Widget,
  displayName: 'Gesture test',
  contexts: {
    grid: { minSize: { cols: 3, rows: 3 }, defaultSize: { cols: 4, rows: 4 } },
  },
  defaults: { data: {}, view: {} },
  // sdk.reveal checks the path with this widget's own fs:validate
  capabilities: [{ cap: 'Metadata', reason: 'Checks that the test file exists before revealing it.' }],
}
