import Widget from './Widget.vue'

// Optional: export suggest() if your widget contributes pathbar suggestions.
// export { suggest } from './suggest'

export default {
  api: '1.0',
  id: 'my-widget',          // change this to your widget type
  version: '0.0.1',
  Component: Widget,
  defaults: {
    data: { rpath: '' },    // keep nested defaults
    view: { layout: 'list', columns: 1, itemSize: 'md', navigateMode: 'internal' }
  },
  capabilities: []          // e.g., ['suggest']
}
