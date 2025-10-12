import Widget from './Widget.vue'

export default {
  api: '1.0',
  id: 'items',
  version: '0.3.1',
  Component: Widget,
  defaults: {
    data: { rpath: '' },
    view: { layout: 'list', columns: 1, itemSize: 'md', showHidden: false, navigateMode: 'internal' }
  },
  capabilities: []
}
