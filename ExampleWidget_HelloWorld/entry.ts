import Widget from './Widget.vue'

export default {
  api: '1.0',
  id: 'hello',
  version: '0.0.1',
  Component: Widget,
  defaults: {
    data: { message: 'Hello, World!', targetPath: '' },
    view: { buttonLabel: 'Open', layout: 'card' }
  },
  capabilities: []
}
